import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubError, type GitHubClient } from '../../src/lib/github';
import { addEvents, getAllEvents, getOutbox, openLernDb } from '../../src/lib/db';
import type { Ereignis, FortschrittsDatei } from '../../src/lib/progress';
import { recordEvent, syncProgress } from '../../src/lib/progressSync';

let n = 0;
let db: Awaited<ReturnType<typeof openLernDb>>;
beforeEach(async () => {
  db = await openLernDb(`sync-${n++}`);
});

class FakeRepo implements GitHubClient {
  files = new Map<string, { text: string; sha: string }>();
  counter = 0;
  offline = false;
  beforePut: (() => void) | null = null;
  puts = 0;
  private chk() {
    if (this.offline) throw new GitHubError('network');
  }
  set(path: string, text: string) {
    this.files.set(path, { text, sha: `sha${++this.counter}` });
  }
  async getRaw(): Promise<never> { throw new Error('unused'); }
  async testAccess() {}
  async getFile(path: string) {
    this.chk();
    const f = this.files.get(path);
    return f ? { ...f } : null;
  }
  async putFile(path: string, text: string, sha: string | null) {
    this.chk();
    if (this.beforePut) { const b = this.beforePut; this.beforePut = null; b(); }
    const cur = this.files.get(path);
    if ((cur?.sha ?? null) !== sha) throw new GitHubError('conflict', 409);
    this.puts++;
    this.set(path, text);
    return { sha: this.files.get(path)!.sha };
  }
  async listDir(path: string) {
    this.chk();
    return [...this.files.keys()].filter((p) => p.startsWith(path + '/')).map((p) => p.slice(path.length + 1));
  }
}

const ev = (geraet: string, zeit: string, ziel = 'k1'): Ereignis => ({ art: 'karte', ziel, zeit, geraet, bewertung: 3 });
const datei = (geraet: string, ereignisse: Ereignis[]): string => JSON.stringify({ version: 1, geraet, ereignisse } satisfies FortschrittsDatei);
const lies = (repo: FakeRepo, p: string) => (JSON.parse(repo.files.get(p)!.text) as FortschrittsDatei).ereignisse;

describe('recordEvent', () => {
  it('schreibt nach events und outbox', async () => {
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z'));
    expect(await getAllEvents(db)).toHaveLength(1);
    expect(await getOutbox(db)).toHaveLength(1);
  });
  it('schreibt beide Stores in einer Transaktion', async () => {
    const spy = vi.spyOn(db, 'transaction');
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toEqual(['events', 'outbox']);
  });
  it('lehnt ungültige zeit ab', async () => {
    await expect(recordEvent(db, ev('pc', 'gestern'))).rejects.toThrow();
    await expect(recordEvent(db, ev('pc', '2026-11-22T10:00:00Z'))).rejects.toThrow();
    expect(await getAllEvents(db)).toHaveLength(0);
  });
});

describe('syncProgress', () => {
  it('offline aufgezeichnet, dann online: Datei enthält Ereignis, Outbox leer', async () => {
    const repo = new FakeRepo();
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z'));
    const r = await syncProgress(repo, db, 'pc');
    expect(r).toEqual({ hochgeladen: 1, offline: false });
    expect(lies(repo, '_fortschritt/pc.json')).toHaveLength(1);
    expect(await getOutbox(db)).toHaveLength(0);
  });

  it('Konflikt: nach Retry stehen beide Listen in der Datei', async () => {
    const repo = new FakeRepo();
    repo.set('_fortschritt/pc.json', datei('pc', [ev('pc', '2026-11-22T09:00:00.000Z', 'a')]));
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z', 'b'));
    repo.beforePut = () => repo.set('_fortschritt/pc.json', datei('pc', [ev('pc', '2026-11-22T09:00:00.000Z', 'a'), ev('pc', '2026-11-22T09:30:00.000Z', 'c')]));
    const r = await syncProgress(repo, db, 'pc');
    expect(r.offline).toBe(false);
    expect(lies(repo, '_fortschritt/pc.json').map((e) => e.ziel).sort()).toEqual(['a', 'b', 'c']);
    expect(await getOutbox(db)).toHaveLength(0);
  });

  it('gibt nach 3 Konflikten auf, Outbox bleibt', async () => {
    const repo = new FakeRepo();
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z'));
    const orig = repo.putFile.bind(repo);
    let versuche = 0;
    repo.putFile = async () => { versuche++; throw new GitHubError('conflict', 409); };
    await expect(syncProgress(repo, db, 'pc')).rejects.toMatchObject({ kind: 'conflict' });
    expect(versuche).toBe(3);
    expect(await getOutbox(db)).toHaveLength(1);
    repo.putFile = orig;
  });

  it('fremde Ereignisse landen in events', async () => {
    const repo = new FakeRepo();
    repo.set('_fortschritt/handy.json', datei('handy', [ev('handy', '2026-11-21T10:00:00.000Z')]));
    repo.set('_fortschritt/kaputt.json', '{nicht json');
    repo.set('_fortschritt/notiz.txt', 'x');
    await syncProgress(repo, db, 'pc');
    const alle = await getAllEvents(db);
    expect(alle.map((e) => e.geraet)).toEqual(['handy']);
    expect(repo.files.get('_fortschritt/kaputt.json')!.text).toBe('{nicht json');
    expect(repo.puts).toBe(0);
  });

  it('Netzfehler: offline, Outbox bleibt', async () => {
    const repo = new FakeRepo();
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z'));
    repo.offline = true;
    expect(await syncProgress(repo, db, 'pc')).toEqual({ hochgeladen: 0, offline: true });
    expect(await getOutbox(db)).toHaveLength(1);
  });

  it('eigene Datei ungültig: Fehler, nicht überschrieben', async () => {
    const repo = new FakeRepo();
    repo.set('_fortschritt/pc.json', 'müll');
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z'));
    await expect(syncProgress(repo, db, 'pc')).rejects.toMatchObject({ kind: 'other' });
    expect(repo.files.get('_fortschritt/pc.json')!.text).toBe('müll');
    expect(await getOutbox(db)).toHaveLength(1);
  });

  it('normalisiert Gerätenamen zu [a-z0-9-]', async () => {
    const repo = new FakeRepo();
    await recordEvent(db, ev('Marios Handy!', '2026-11-22T10:00:00.000Z'));
    await syncProgress(repo, db, 'Marios Handy!');
    expect([...repo.files.keys()]).toEqual(['_fortschritt/marios-handy-.json']);
  });

  it('bereits enthaltene Ereignisse werden nicht doppelt geschrieben', async () => {
    const repo = new FakeRepo();
    const e = ev('pc', '2026-11-22T10:00:00.000Z');
    repo.set('_fortschritt/pc.json', datei('pc', [e]));
    await addEvents(db, [e]);
    await recordEvent(db, e);
    const r = await syncProgress(repo, db, 'pc');
    expect(r.hochgeladen).toBe(0);
    expect(repo.puts).toBe(0);
    expect(await getOutbox(db)).toHaveLength(0);
  });

  it('Ereignis während des Syncs bleibt in der Outbox', async () => {
    const repo = new FakeRepo();
    await recordEvent(db, ev('pc', '2026-11-22T10:00:00.000Z', 'a'));
    repo.beforePut = () => { void recordEvent(db, ev('pc', '2026-11-22T10:05:00.000Z', 'spaet')); };
    await syncProgress(repo, db, 'pc');
    await new Promise((r) => setTimeout(r, 20));
    expect((await getOutbox(db)).map((e) => e.ziel)).toEqual(['spaet']);
  });

  it('verwirft ungültige fremde Ereignisse einzeln', async () => {
    const repo = new FakeRepo();
    const gut = ev('handy', '2026-11-21T10:00:00.000Z', 'ok');
    const z = '2026-11-21T10:00:00.000Z';
    const kaputt = [
      { art: 'karte', ziel: 'x', zeit: z, geraet: 'handy' },
      { art: 'karte', ziel: 'x', zeit: z, geraet: 'handy', bewertung: 7 },
      { art: 'uebung', ziel: 'x', zeit: z, geraet: 'handy', richtig: 'ja' },
      { art: 'pruefung', ziel: 'x', zeit: z, geraet: 'handy', punkte: 1 },
      { art: 'karte', ziel: 'x', zeit: 'gestern', geraet: 'handy', bewertung: 3 },
      { art: 'foo', ziel: 'x', zeit: z, geraet: 'handy' },
    ] as unknown as Ereignis[];
    repo.set('_fortschritt/handy.json', datei('handy', [gut, ...kaputt]));
    await syncProgress(repo, db, 'pc');
    expect((await getAllEvents(db)).map((e) => e.ziel)).toEqual(['ok']);
  });

  it('leerer Gerätename: normaler Error', async () => {
    await expect(syncProgress(new FakeRepo(), db, '')).rejects.not.toBeInstanceOf(GitHubError);
  });
});
