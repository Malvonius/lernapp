import 'fake-indexeddb/auto';
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { getAllEvents, getFile, openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { recordEvent } from '../../src/lib/progressSync';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`probe-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});
// Hintergrund-Sync zu Ende laufen lassen, bevor die Umgebung abgebaut wird.
afterEach(async () => {
  vi.useRealTimers();
  await waitFor(async () => expect(await getFile(db, 'index.json')).toBeTruthy());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
});

const PFAD = '#/probe/mathe/mathe-probe-ableitungen-1';
const ZIEL = 'probe:mathe-probe-ableitungen-1';

function oeffne(hash: string, opts: { ohneSchluessel?: boolean } = {}) {
  window.location.hash = hash;
  const f = fakeClient(index);
  const client = opts.ohneSchluessel
    ? {
        ...f.client,
        getRaw: async (p: string, e?: string) => {
          const r = await f.client.getRaw(p, e);
          return p.endsWith('Probe Ableitungen.md') && r !== 'unchanged' ? { ...r, text: r.text.replace(/notenschluessel:\n(  - .*\n)+/, '') } : r;
        },
      }
    : f.client;
  render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
}

const klick = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

async function starte(opts: { ohneSchluessel?: boolean } = {}) {
  oeffne(PFAD, opts);
  fireEvent.click(await screen.findByRole('button', { name: 'Starten' }));
  await screen.findByText(/Aufgabe 1 von 3/);
}

/** eingabe richtig, mc falsch, offen teilweise → 4 + 0 + 2,5 = 6,5 von 12 */
async function bearbeite() {
  fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '8' } });
  klick('Prüfen');
  klick('Nächste Aufgabe');
  await screen.findByText(/Aufgabe 2 von 3/);
  // dritte Option (−sin x) ist falsch
  fireEvent.click(screen.getAllByRole('checkbox')[2]!);
  klick('Prüfen');
  klick('Nächste Aufgabe');
  await screen.findByText(/Aufgabe 3 von 3/);
  klick('Lösung zeigen');
  fireEvent.click(screen.getByRole('button', { name: /^Teilweise/ }));
}

describe('Fach: Probe-Schularbeiten', () => {
  it('listet die Probe mit Dauer und Punkten; ohne Ergebnis „noch nicht geschrieben“', async () => {
    oeffne('#/fach/mathe');
    const abschnitt = await screen.findByRole('region', { name: 'Probe-Schularbeiten' });
    const link = within(abschnitt).getByRole('link', { name: /Probe-Schularbeit Differentialrechnung/ });
    expect(link).toHaveAttribute('href', PFAD);
    expect(link).toHaveTextContent(/20 Min/);
    expect(link).toHaveTextContent(/12 Punkte/);
    expect(link).toHaveTextContent(/noch nicht geschrieben/);
  });

  it('zeigt das letzte Ergebnis aus den Prüfungs-Ereignissen (auch von anderen Geräten)', async () => {
    await recordEvent(db, { art: 'pruefung', ziel: ZIEL, zeit: '2026-11-20T10:00:00.000Z', geraet: 'pc', punkte: 5, max: 12 });
    await recordEvent(db, { art: 'pruefung', ziel: ZIEL, zeit: '2026-11-21T10:00:00.000Z', geraet: 'handy', punkte: 9.5, max: 12 });
    await recordEvent(db, { art: 'pruefung', ziel: 'mathe:01 Analysis', zeit: '2026-11-21T11:00:00.000Z', geraet: 'pc', punkte: 1, max: 10 });
    oeffne('#/fach/mathe');
    const abschnitt = await screen.findByRole('region', { name: 'Probe-Schularbeiten' });
    expect(within(abschnitt).getByRole('link')).toHaveTextContent(/Zuletzt 9,5 von 12/);
  });
});

describe('Probe', () => {
  it('Startseite: Titel, Dauer, Punkte, Hinweise; Starten zeigt Aufgabe 1 mit Timer', async () => {
    oeffne(PFAD);
    expect(await screen.findByRole('heading', { level: 1, name: 'Probe-Schularbeit Differentialrechnung' })).toBeInTheDocument();
    expect(screen.getByText(/20 Minuten/)).toBeInTheDocument();
    expect(screen.getByText(/12 Punkte/)).toBeInTheDocument();
    expect(screen.getByText(/Formelsammlung und Taschenrechner/)).toBeInTheDocument();
    klick('Starten');
    expect(await screen.findByText(/Aufgabe 1 von 3/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('20:00');
  });

  it('bewertet automatisch und per Selbsteinschätzung, zeigt Note mit Schlüssel und speichert Ereignisse', async () => {
    await starte();
    await bearbeite();
    klick('Abgeben');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ergebnis' })).toBeInTheDocument();
    expect(screen.getByText(/6,5 von 12/)).toBeInTheDocument();
    expect(screen.getByText('54,1 %')).toBeInTheDocument();
    expect(screen.getByText(/Note 4/)).toBeInTheDocument();
    // falsch und teilweise: zum Nachsehen gelistet, die richtige nicht
    const liste = screen.getByRole('list', { name: 'Nochmal ansehen' });
    expect(liste.querySelectorAll(':scope > li')).toHaveLength(2);
    expect(liste).toHaveTextContent(/2,5 von 5/);
    expect(liste).toHaveTextContent(/0 von 3/);

    await waitFor(async () => {
      const ev = await getAllEvents(db);
      expect(ev.find((e) => e.art === 'pruefung')).toMatchObject({ ziel: ZIEL, punkte: 6.5, max: 12 });
      expect(ev.filter((e) => e.art === 'uebung').map((e) => [e.ziel, e.richtig]).sort()).toEqual([
        ['u-pr0001', true],
        ['u-pr0002', false],
        ['u-pr0003', false],
      ]);
    });
  });

  it('ohne Notenschlüssel: keine Note, sondern ein Hinweis', async () => {
    await starte({ ohneSchluessel: true });
    await bearbeite();
    klick('Abgeben');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ergebnis' })).toBeInTheDocument();
    expect(screen.getByText('Kein Notenschlüssel hinterlegt')).toBeInTheDocument();
    expect(screen.queryByText(/Note \d/)).toBeNull();
  });

  it('vor und zurück: beantwortete Aufgaben behalten ihren Stand', async () => {
    await starte();
    fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '8' } });
    klick('Prüfen');
    klick('Nächste Aufgabe');
    await screen.findByText(/Aufgabe 2 von 3/);
    klick('Vorherige Aufgabe');
    await screen.findByText(/Aufgabe 1 von 3/);
    expect(screen.getByLabelText('Deine Antwort')).toHaveValue('8');
    expect(screen.getByLabelText('Deine Antwort')).toBeDisabled();
    expect(screen.getByText('Richtig')).toBeInTheDocument();
    // direkt springen über die Aufgabenleiste
    fireEvent.click(screen.getByRole('button', { name: /Aufgabe 3/ }));
    expect(await screen.findByText(/Aufgabe 3 von 3/)).toBeInTheDocument();
  });

  it('mit offenen Aufgaben fragt Abgeben nach; Weiterarbeiten bleibt in der Probe', async () => {
    await starte();
    klick('Abgeben');
    expect(screen.getByText(/Noch 3 Aufgaben offen/)).toBeInTheDocument();
    klick('Weiterarbeiten');
    expect(screen.getByText(/Aufgabe 1 von 3/)).toBeInTheDocument();
    klick('Abgeben');
    klick('Trotzdem abgeben');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ergebnis' })).toBeInTheDocument();
    expect(screen.getByText(/0 von 12/)).toBeInTheDocument();
  });

  it('Zeitablauf gibt automatisch ab; offene Aufgaben zählen 0', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await starte();
    fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '8' } });
    klick('Prüfen');
    await act(async () => {
      vi.advanceTimersByTime(20 * 60_000 + 1000);
    });
    vi.useRealTimers();
    expect(await screen.findByRole('heading', { level: 1, name: 'Ergebnis' })).toBeInTheDocument();
    expect(screen.getByText(/Die Zeit ist abgelaufen/)).toBeInTheDocument();
    expect(screen.getByText(/4 von 12/)).toBeInTheDocument();
    await waitFor(async () => expect((await getAllEvents(db)).find((e) => e.art === 'pruefung')).toMatchObject({ ziel: ZIEL, punkte: 4, max: 12 }));
  });

  it('unbekannte Probe: Hinweis und Link zurück zum Fach', async () => {
    oeffne('#/probe/mathe/gibt-es-nicht');
    expect(await screen.findByRole('heading', { name: 'Probe nicht gefunden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu Angewandte Mathematik/ })).toHaveAttribute('href', '#/fach/mathe');
  });
});
