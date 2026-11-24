import 'fake-indexeddb/auto';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { getFile, openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { recordEvent } from '../../src/lib/progressSync';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`statistik-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});
afterEach(async () => {
  await waitFor(async () => expect(await getFile(db, 'index.json')).toBeTruthy());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
});

function oeffne(hash = '#/statistik') {
  window.location.hash = hash;
  const { client } = fakeClient(index);
  render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
}

async function mitDaten() {
  const ev = [
    { art: 'karte', ziel: 'k-a1b2c3', zeit: '2026-11-21T09:00:00.000Z', geraet: 'handy', bewertung: 1 },
    { art: 'karte', ziel: 'k-a1b2c3', zeit: '2026-11-22T09:00:00.000Z', geraet: 'pc', bewertung: 1 },
    { art: 'karte', ziel: 'k-d4e5f6', zeit: '2026-11-22T09:05:00.000Z', geraet: 'pc', bewertung: 3 },
    { art: 'uebung', ziel: 'u-aaa111', zeit: '2026-11-22T09:10:00.000Z', geraet: 'pc', richtig: true },
    { art: 'pruefung', ziel: 'probe:mathe-probe-ableitungen-1', zeit: '2026-11-22T10:00:00.000Z', geraet: 'pc', punkte: 9.5, max: 12 },
  ] as const;
  for (const e of ev) await recordEvent(db, { ...e } as never);
}

describe('Statistik', () => {
  it('leere Daten: öffnet ohne Fehler, Kennzahlen 0 und ein Hinweis zum Loslegen', async () => {
    oeffne();
    expect(await screen.findByRole('heading', { level: 1, name: 'Statistik' })).toBeInTheDocument();
    expect(await screen.findByText(/Noch keine Lerndaten/)).toBeInTheDocument();
    const kennzahlen = screen.getByRole('list', { name: 'Kennzahlen' });
    expect(within(kennzahlen).getByText('Bewertungen in 14 Tagen').closest('li')).toHaveTextContent('0');
    expect(screen.getByRole('link', { name: 'Jetzt wiederholen' })).toHaveAttribute('href', '#/wiederholen');
  });

  it('zeigt Aktivität, Trefferquote, meist vergessene Karten und den Prüfungsverlauf', async () => {
    await mitDaten();
    oeffne();
    const aktivitaet = await screen.findByRole('region', { name: 'Aktivität' });
    expect(within(aktivitaet).getByRole('img', { name: /Bewertungen pro Tag/ })).toHaveAccessibleName(/heute 3/);
    // Textalternative als Tabelle
    expect(within(aktivitaet).getByRole('table')).toHaveTextContent(/22\.11\..*3/);

    expect(screen.getByRole('region', { name: 'Glut-Kalender' })).toBeInTheDocument();

    const quote = screen.getByRole('region', { name: 'Trefferquote' });
    expect(within(quote).getByText('Analysis')).toBeInTheDocument();
    expect(quote).toHaveTextContent(/Karten 33 %/);
    expect(quote).toHaveTextContent(/1 von 3/);
    expect(quote).toHaveTextContent(/Übungen 100 %/);

    const vergessen = screen.getByRole('region', { name: 'Meist vergessen' });
    expect(vergessen).toHaveTextContent(/2× Nochmal/);
    expect(within(vergessen).getByRole('link', { name: /Wiederholen/ })).toHaveAttribute('href', '#/wiederholen?thema=mathe-ableitungen');

    const verlauf = screen.getByRole('region', { name: 'Prüfungen und Proben' });
    expect(verlauf).toHaveTextContent(/Probe-Schularbeit Differentialrechnung/);
    expect(verlauf).toHaveTextContent(/9,5 von 12/);

    const kennzahlen = screen.getByRole('list', { name: 'Kennzahlen' });
    expect(within(kennzahlen).getByText('Bewertungen in 14 Tagen').closest('li')).toHaveTextContent('4');
    expect(within(kennzahlen).getByText('Lerntage in Folge').closest('li')).toHaveTextContent('2');
  });

  it('Fach-Filter über ?fach= und die Auswahl', async () => {
    await mitDaten();
    oeffne('#/statistik?fach=mathe');
    const auswahl = (await screen.findByLabelText('Fach')) as HTMLSelectElement;
    expect(auswahl.value).toBe('mathe');
    fireEvent.change(auswahl, { target: { value: '' } });
    await waitFor(() => expect(window.location.hash).toBe('#/statistik'));
  });

  it('Einstieg auf Start und im Fach', async () => {
    oeffne('#/');
    expect(await screen.findByRole('link', { name: 'Statistik' })).toHaveAttribute('href', '#/statistik');
  });

  it('Einstieg im Fach-Screen mit Fach-Filter', async () => {
    oeffne('#/fach/mathe');
    expect(await screen.findByRole('link', { name: 'Statistik zu diesem Fach' })).toHaveAttribute('href', '#/statistik?fach=mathe');
  });
});
