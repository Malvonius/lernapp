import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildIndex } from '../../src/format/buildIndex';
import type { LernIndex } from '../../src/format/types';
import { GitHubError, type GitHubClient } from '../../src/lib/github';

export const ROOT = join(__dirname, '..', 'fixtures', 'lernstoff-mini');

export async function fixtureIndex(): Promise<LernIndex> {
  return (await buildIndex(ROOT, { fix: false, now: new Date('2026-11-22T10:00:00Z') })).index;
}

/** Fake-GitHub: liefert den Fixture-Index und die Fixture-Dateien; `fail` lässt jede Anfrage scheitern. */
export function fakeClient(index: LernIndex, opts: { fail?: GitHubError } = {}) {
  const state = { fail: opts.fail, testAccessCalls: 0, puts: [] as string[] };
  const chk = () => {
    if (state.fail) throw state.fail;
  };
  const client: GitHubClient = {
    async getRaw(path) {
      chk();
      if (path === 'index.json') return { text: JSON.stringify(index), etag: '"e1"' };
      return { text: await readFile(join(ROOT, ...path.split('/')), 'utf8'), etag: null };
    },
    async getFile() {
      chk();
      return null;
    },
    async putFile(path) {
      chk();
      state.puts.push(path);
      return { sha: `sha${state.puts.length}` };
    },
    async putBinary() {
      chk();
      return { sha: 'bin' };
    },
    async listDir() {
      chk();
      return [];
    },
    async testAccess() {
      state.testAccessCalls++;
      chk();
    },
  };
  return { client, state };
}
