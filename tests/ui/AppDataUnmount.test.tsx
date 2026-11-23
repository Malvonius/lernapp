import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppDataProvider } from '../../src/state/AppData';
import type { LernIndex } from '../../src/format/types';
import { GitHubError, type GitHubClient } from '../../src/lib/github';
import { openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`unmount-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});
afterEach(() => vi.restoreAllMocks());

/** Client, dessen Index-Anfrage erst auf Kommando antwortet (oder scheitert). */
function langsamerClient() {
  const { client: basis } = fakeClient(index);
  let loese!: (ok: boolean) => void;
  const gate = new Promise<boolean>((res) => (loese = res));
  let angefragt = false;
  const client: GitHubClient = {
    ...basis,
    async getRaw(path, ...rest) {
      angefragt = true;
      if (!(await gate)) throw new GitHubError('network');
      return basis.getRaw(path, ...(rest as []));
    },
  };
  return { client, loese, angefragt: () => angefragt };
}

describe('AppDataProvider nach dem Unmount', () => {
  it.each([
    ['Anfrage scheitert', false],
    ['Anfrage gelingt', true],
  ])('kein setState und kein unhandled Error, wenn die Index-Anfrage erst nach dem Unmount endet (%s)', async (_n, ok) => {
    const fehler: unknown[] = [];
    const sammle = (e: unknown) => fehler.push(e);
    process.on('unhandledRejection', sammle);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { client, loese, angefragt } = langsamerClient();
      const { unmount } = render(
        <AppDataProvider db={db} createClient={() => client}>
          <p>drin</p>
        </AppDataProvider>,
      );
      await screen.findByText('drin');
      await waitFor(() => expect(angefragt()).toBe(true));
      unmount();
      // Wie am CI-Ende: die Umgebung ist weg, sobald der Hintergrundlauf zurückkehrt.
      vi.stubGlobal('window', undefined);
      loese(ok);
      await new Promise((r) => setTimeout(r, 100));
      vi.unstubAllGlobals();
      expect(fehler).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      process.off('unhandledRejection', sammle);
    }
  });
});
