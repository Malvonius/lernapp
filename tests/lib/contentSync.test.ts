import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/format/buildIndex';
import type { LernIndex } from '../../src/format/types';
import { loadTopic, syncContent } from '../../src/lib/contentSync';
import { getFile, getMeta, openLernDb, putFile } from '../../src/lib/db';
import { GitHubError, type GitHubClient } from '../../src/lib/github';

const ROOT = join(__dirname, '..', 'fixtures', 'lernstoff-mini');
const topicPaths = (i: LernIndex) =>
  i.faecher.flatMap((f) => [...f.kapitel.flatMap((k) => k.themen), ...f.nichtZugeordnet]).flatMap((t) => (t.pfad ? [t.pfad] : []));

let baseIndex: LernIndex;
beforeAll(async () => {
  baseIndex = (await buildIndex(ROOT, { fix: false, now: new Date('2026-11-22T10:00:00Z') })).index;
});

/** Fake-Client: liefert den aktuellen Index (mit ETag) und die Fixture-Dateien. */
function fake(state: { index: LernIndex; etag: string; fail?: GitHubError; contents?: Record<string, string> }) {
  const calls: string[] = [];
  const client: GitHubClient = {
    async getRaw(path, etag) {
      calls.push(path);
      if (state.fail) throw state.fail;
      if (path === 'index.json') {
        if (etag === state.etag) return 'unchanged';
        return { text: JSON.stringify(state.index), etag: state.etag };
      }
      const text = state.contents?.[path] ?? (await readFile(join(ROOT, ...path.split('/')), 'utf8'));
      return { text, etag: null };
    },
    async getFile() { throw new Error('unused'); },
    async putFile() { throw new Error('unused'); },
    async listDir() { throw new Error('unused'); },
    async testAccess() {},
  };
  return { client, calls };
}

let n = 0;
let db: Awaited<ReturnType<typeof openLernDb>>;
beforeEach(async () => {
  db = await openLernDb(`sync-${n++}`);
});

describe('syncContent', () => {
  it('erster Sync lädt alle Themendateien', async () => {
    const { client, calls } = fake({ index: baseIndex, etag: '"e1"' });
    const r = await syncContent(client, db);
    const paths = topicPaths(baseIndex);
    expect(paths.length).toBeGreaterThan(0);
    expect([...r.geaendert].sort()).toEqual([...paths].sort());
    expect(calls.filter((c) => c !== 'index.json').sort()).toEqual([...paths].sort());
    expect(r.offline).toBe(false);
    expect(r.stand).toBe(baseIndex.erstellt);
    expect(r.index).toEqual(baseIndex);
    expect(await getMeta(db, 'indexEtag')).toBe('"e1"');
    expect(typeof (await getMeta(db, 'lastSync'))).toBe('string');
    expect((await getFile(db, paths[0]!))?.hash).toBeTruthy();
    expect(await loadTopic(db, paths[0]!)).not.toBeNull();
  });

  it('zweiter Sync mit unverändertem Index lädt keine Datei', async () => {
    const f = fake({ index: baseIndex, etag: '"e1"' });
    await syncContent(f.client, db);
    f.calls.length = 0;
    const r = await syncContent(f.client, db);
    expect(f.calls).toEqual(['index.json']);
    expect(r.geaendert).toEqual([]);
    expect(r.index).toEqual(baseIndex);
    expect(r.offline).toBe(false);
  });

  it('geänderter Hash eines Themas lädt nur dieses Thema', async () => {
    const state = { index: baseIndex, etag: '"e1"' };
    const f = fake(state);
    await syncContent(f.client, db);
    f.calls.length = 0;
    const next: LernIndex = structuredClone(baseIndex);
    const t = next.faecher[0]!.kapitel.flatMap((k) => k.themen).find((x) => x.pfad)!;
    t.hash = 'neuerhash';
    state.index = next;
    state.etag = '"e2"';
    const r = await syncContent(f.client, db);
    expect(r.geaendert).toEqual([t.pfad]);
    expect(f.calls).toEqual(['index.json', t.pfad]);
    expect((await getFile(db, t.pfad!))?.hash).toBe('neuerhash');
  });

  it('aus dem Index entferntes Thema fehlt danach im Cache', async () => {
    const state = { index: baseIndex, etag: '"e1"' };
    const f = fake(state);
    await syncContent(f.client, db);
    const next: LernIndex = structuredClone(baseIndex);
    const gone = next.faecher[0]!.kapitel[0]!.themen.find((x) => x.pfad)!;
    next.faecher[0]!.kapitel[0]!.themen = next.faecher[0]!.kapitel[0]!.themen.filter((x) => x !== gone);
    state.index = next;
    state.etag = '"e2"';
    await syncContent(f.client, db);
    expect(await getFile(db, gone.pfad!)).toBeUndefined();
    expect(await getFile(db, 'index.json')).toBeDefined();
  });

  it('Netzfehler mit Cache: offline, Index aus dem Cache', async () => {
    const state: Parameters<typeof fake>[0] = { index: baseIndex, etag: '"e1"' };
    const f = fake(state);
    await syncContent(f.client, db);
    state.fail = new GitHubError('network');
    const r = await syncContent(f.client, db);
    expect(r.offline).toBe(true);
    expect(r.index).toEqual(baseIndex);
    expect(r.geaendert).toEqual([]);
    expect(r.stand).toBe(baseIndex.erstellt);
  });

  it('Netzfehler ohne Cache wirft network', async () => {
    const f = fake({ index: baseIndex, etag: '"e1"', fail: new GitHubError('network') });
    await expect(syncContent(f.client, db)).rejects.toMatchObject({ kind: 'network' });
  });

  it('andere Fehler werden auch mit Cache unverändert geworfen', async () => {
    const state: Parameters<typeof fake>[0] = { index: baseIndex, etag: '"e1"' };
    const f = fake(state);
    await syncContent(f.client, db);
    state.fail = new GitHubError('auth', 401);
    await expect(syncContent(f.client, db)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('fehlende Datei im Cache wird bei unverändertem Index nachgeladen', async () => {
    const f = fake({ index: baseIndex, etag: '"e1"' });
    await syncContent(f.client, db);
    const p = topicPaths(baseIndex)[0]!;
    await db.delete('files', p);
    const r = await syncContent(f.client, db);
    expect(r.geaendert).toEqual([p]);
  });
});

describe('loadTopic', () => {
  it('null für unbekannten Pfad', async () => {
    expect(await loadTopic(db, 'gibt/es/nicht.md')).toBeNull();
  });
  it('parst den Cache-Inhalt', async () => {
    await putFile(db, 'x.md', { text: '---\nid: x-y\ntitel: Titel\n---\n', hash: 'h' });
    const t = await loadTopic(db, 'x.md');
    expect(t).not.toBeNull();
    expect(t!.titel).toBe('Titel');
  });
});
