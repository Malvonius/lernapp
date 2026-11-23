import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { recordEvent } from '../../src/lib/progressSync';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  window.location.hash = '';
  db = await openLernDb(`jetzt-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
  // gelernt am 22.11.2026 (Wien)
  await recordEvent(db, { art: 'karte', ziel: 'k-a1b2c3', bewertung: 3, geraet: 'pc', zeit: '2026-11-22T08:00:00.000Z' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function sichtbarkeit(wert: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(wert);
}

async function starte(jetzt: string) {
  vi.setSystemTime(new Date(jetzt));
  const r = render(<App db={db} createClient={() => fakeClient(index).client} />);
  const glut = await vi.waitFor(() => screen.getByRole('region', { name: 'Glut' }), { timeout: 5000 });
  return { ...r, glut };
}

describe('jetzt bleibt nicht stehen', () => {
  it('nach Mitternacht (Wien) wechselt die Glut von „brennt“ auf „glimmt“, auch im Hintergrund', async () => {
    sichtbarkeit('hidden'); // nur der Mitternachts-Timer kann hier greifen
    const { glut } = await starte('2026-11-22T22:30:00Z'); // 23:30 Wien
    expect(glut).toHaveAttribute('data-zustand', 'brennt');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40 * 60_000); // 00:10 Wien
    });
    const neu = screen.getByRole('region', { name: 'Glut' });
    expect(neu).toHaveAttribute('data-zustand', 'glimmt');
    expect(within(neu).getByText('Heute noch nicht gelernt – halte die Glut am Leben')).toBeInTheDocument();
  });

  it('beim Sichtbarwerden wird jetzt neu berechnet', async () => {
    sichtbarkeit('hidden');
    const { glut } = await starte('2026-11-22T12:00:00Z');
    expect(glut).toHaveAttribute('data-zustand', 'brennt');
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z')); // Uhr springt, kein Timer läuft ab
    sichtbarkeit('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('region', { name: 'Glut' })).toHaveAttribute('data-zustand', 'glimmt');
  });

  it('alle 5 Minuten, solange sichtbar', async () => {
    sichtbarkeit('visible');
    const { glut } = await starte('2026-11-22T12:00:00Z');
    expect(glut).toHaveAttribute('data-zustand', 'brennt');
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
    });
    expect(screen.getByRole('region', { name: 'Glut' })).toHaveAttribute('data-zustand', 'glimmt');
  });

  it('beim Abbau bleiben keine Timer übrig', async () => {
    sichtbarkeit('visible');
    const { unmount } = await starte('2026-11-22T12:00:00Z');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
