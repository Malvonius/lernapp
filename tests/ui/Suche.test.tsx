import 'fake-indexeddb/auto';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { getFile, openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`suche-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});

// Hintergrund-Sync zu Ende laufen lassen, bevor die Umgebung abgebaut wird.
afterEach(async () => {
  await waitFor(async () => expect(await getFile(db, 'index.json')).toBeTruthy());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
});

async function oeffne() {
  window.location.hash = '#/suche';
  const { client } = fakeClient(index);
  render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
  return screen.findByRole('searchbox', { name: 'Suche' });
}

describe('Suche', () => {
  it('Suchfeld ist fokussiert, Treffer erscheinen beim Tippen und verlinken das Thema', async () => {
    const feld = await oeffne();
    await waitFor(() => expect(feld).toHaveFocus());
    fireEvent.change(feld, { target: { value: 'kettenregel' } });
    const link = await screen.findByRole('link', { name: /Ableitungen/ });
    expect(link).toHaveAttribute('href', '#/thema/mathe/mathe-ableitungen');
    expect(document.querySelector('mark')?.textContent?.toLowerCase()).toBe('kettenregel');
  });

  it('Treffer im Titel werden im Titel hervorgehoben', async () => {
    const feld = await oeffne();
    fireEvent.change(feld, { target: { value: 'ableit' } });
    const link = await screen.findByRole('link', { name: /Ableitungen · .* · Titel/ });
    const mark = link.querySelector('.suche-treffer__kopf mark');
    expect(mark?.textContent?.toLowerCase()).toBe('ableit');
  });

  it('ohne Treffer: Hinweis; Markup in der Eingabe wird nie als HTML gerendert', async () => {
    const feld = await oeffne();
    fireEvent.change(feld, { target: { value: '<img src=x onerror=alert(1)>' } });
    expect(await screen.findByText(/Nichts gefunden/)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('Suche ist aus der Kopfzeile erreichbar', async () => {
    window.location.hash = '#/';
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByRole('link', { name: 'Zur Suche' })).toHaveAttribute('href', '#/suche');
  });
});
