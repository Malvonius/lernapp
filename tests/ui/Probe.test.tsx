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

/** Während der Probe: eingabe 8 (richtig), mc dritte Option (falsch), offen mit Notizen. Kein Feedback. */
async function bearbeite() {
  fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '8' } });
  klick('Nächste Aufgabe');
  await screen.findByText(/Aufgabe 2 von 3/);
  // dritte Option (−sin x) ist falsch
  fireEvent.click(screen.getAllByRole('checkbox')[2]!);
  klick('Nächste Aufgabe');
  await screen.findByText(/Aufgabe 3 von 3/);
  fireEvent.change(screen.getByLabelText('Deine Lösung'), { target: { value: 'x = ±1, Tiefpunkt bei 1' } });
}

/** Während der Probe darf nichts verraten werden */
function keinFeedback() {
  expect(screen.queryByText(/^Richtig$|Nicht richtig/)).toBeNull();
  expect(screen.queryByText(/Lösung:|Hochpunkt|Tiefpunkt \(/)).toBeNull();
  expect(screen.queryByRole('button', { name: /Prüfen|Lösung zeigen|Volle Punkte|Teilweise/ })).toBeNull();
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
    const blatt = screen.getByLabelText('20 Minuten, 12 Punkte, 3 Aufgaben');
    expect(blatt).toHaveTextContent(/Dauer\s*20 Min/);
    expect(blatt).toHaveTextContent(/Punkte\s*12/);
    expect(screen.getByText(/Formelsammlung und Taschenrechner/)).toBeInTheDocument();
    klick('Starten');
    expect(await screen.findByText(/Aufgabe 1 von 3/)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('20:00');
  });

  it('während des Schreibens: kein Richtig/Falsch, keine Lösung, keine Ereignisse', async () => {
    await starte();
    await bearbeite();
    keinFeedback();
    klick('Vorherige Aufgabe');
    klick('Vorherige Aufgabe');
    await screen.findByText(/Aufgabe 1 von 3/);
    keinFeedback();
    expect((await getAllEvents(db)).length).toBe(0);
  });

  it('nach der Abgabe: automatische Punkte, Selbsteinschätzung auf der Ergebnisseite ändert Punkte und Note', async () => {
    await starte();
    await bearbeite();
    klick('Abgeben');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ergebnis' })).toBeInTheDocument();
    // offen noch nicht eingeschätzt: 4 + 0 + 0
    expect(screen.getByText('4 von 12')).toBeInTheDocument();
    const einschaetzen = screen.getByRole('region', { name: 'Selbst einschätzen' });
    expect(einschaetzen).toHaveTextContent(/Tiefpunkt bei 1/); // eigene Lösung
    expect(einschaetzen).toHaveTextContent(/Hochpunkt/); // Musterlösung
    fireEvent.click(within(einschaetzen).getByRole('button', { name: /^Teilweise/ }));
    expect(screen.getByText('6,5 von 12')).toBeInTheDocument();
    expect(screen.getByText('54,1 %')).toBeInTheDocument();
    expect(screen.getByText(/Note 4/)).toBeInTheDocument();
    fireEvent.click(within(einschaetzen).getByRole('button', { name: /^Voll/ }));
    expect(screen.getByText('9 von 12')).toBeInTheDocument();
    expect(screen.getByText(/Note 2/)).toBeInTheDocument();
    // erst jetzt gespeichert
    expect((await getAllEvents(db)).length).toBe(0);
    klick('Ergebnis speichern');
    expect(await screen.findByText('Ergebnis gespeichert')).toBeInTheDocument();
    expect(within(einschaetzen).getByRole('button', { name: /^Voll/ })).toBeDisabled();

    const liste = screen.getByRole('list', { name: 'Nochmal ansehen' });
    expect(liste.querySelectorAll(':scope > li')).toHaveLength(1);
    expect(liste).toHaveTextContent(/0 von 3/);

    await waitFor(async () => {
      const ev = await getAllEvents(db);
      expect(ev.find((e) => e.art === 'pruefung')).toMatchObject({ ziel: ZIEL, punkte: 9, max: 12 });
      expect(ev.filter((e) => e.art === 'uebung').map((e) => [e.ziel, e.richtig]).sort()).toEqual([
        ['u-pr0001', true],
        ['u-pr0002', false],
        ['u-pr0003', true],
      ]);
    });
  });

  it('ohne Notenschlüssel: keine Note, sondern ein Hinweis', async () => {
    await starte({ ohneSchluessel: true });
    await bearbeite();
    klick('Abgeben');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ergebnis' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Teilweise/ }));
    expect(screen.getByText('Kein Notenschlüssel hinterlegt')).toBeInTheDocument();
    expect(screen.queryByText(/Note \d/)).toBeNull();
    klick('Ergebnis speichern');
    expect(await screen.findByText('Ergebnis gespeichert')).toBeInTheDocument();
  });

  it('vor und zurück: Antworten bleiben erhalten und sind änderbar', async () => {
    await starte();
    fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '8' } });
    klick('Nächste Aufgabe');
    await screen.findByText(/Aufgabe 2 von 3/);
    klick('Vorherige Aufgabe');
    await screen.findByText(/Aufgabe 1 von 3/);
    const feld = screen.getByLabelText('Deine Antwort');
    expect(feld).toHaveValue('8');
    expect(feld).toBeEnabled();
    fireEvent.change(feld, { target: { value: '9' } });
    expect(screen.getByRole('button', { name: 'Aufgabe 1, beantwortet' })).toBeInTheDocument();
    // direkt springen über die Aufgabenleiste
    fireEvent.click(screen.getByRole('button', { name: /Aufgabe 3/ }));
    expect(await screen.findByText(/Aufgabe 3 von 3/)).toBeInTheDocument();
    klick('Abgeben');
    klick('Trotzdem abgeben');
    // geänderte Antwort 9 ist falsch
    expect(await screen.findByText('0 von 12')).toBeInTheDocument();
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
    expect(screen.getByText('0 von 12')).toBeInTheDocument();
    // nichts einzuschätzen: sofort gespeichert
    await waitFor(async () => expect((await getAllEvents(db)).find((e) => e.art === 'pruefung')).toMatchObject({ punkte: 0, max: 12 }));
  });

  it('Zeitablauf gibt automatisch ab; offene Aufgaben zählen 0', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await starte();
    fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '8' } });
    await act(async () => {
      vi.advanceTimersByTime(20 * 60_000 + 1000);
    });
    vi.useRealTimers();
    expect(await screen.findByRole('heading', { level: 1, name: 'Ergebnis' })).toBeInTheDocument();
    expect(screen.getByText(/Die Zeit ist abgelaufen/)).toBeInTheDocument();
    expect(screen.getByText('4 von 12')).toBeInTheDocument();
    await waitFor(async () => expect((await getAllEvents(db)).find((e) => e.art === 'pruefung')).toMatchObject({ ziel: ZIEL, punkte: 4, max: 12 }));
  });

  it('unbekannte Probe: Hinweis und Link zurück zum Fach', async () => {
    oeffne('#/probe/mathe/gibt-es-nicht');
    expect(await screen.findByRole('heading', { name: 'Probe nicht gefunden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu Angewandte Mathematik/ })).toHaveAttribute('href', '#/fach/mathe');
  });
});

describe('Probe: Speichern beim Schließen und Rerender', () => {
  const pruefungen = async () => (await getAllEvents(db)).filter((e) => e.art === 'pruefung');
  const sichtbarkeit = (wert: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => wert });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  };

  async function bisZurEinschaetzung() {
    await starte();
    await bearbeite();
    klick('Abgeben');
    await screen.findByRole('region', { name: 'Selbst einschätzen' });
    fireEvent.click(screen.getByRole('button', { name: /^Teilweise/ }));
  }

  it('in den Hintergrund auf der Ergebnisseite: genau ein pruefung-Ereignis, kein zweites danach', async () => {
    await bisZurEinschaetzung();
    expect(await pruefungen()).toHaveLength(0);
    await act(async () => sichtbarkeit('hidden'));
    await waitFor(async () => expect(await pruefungen()).toHaveLength(1));
    expect((await pruefungen())[0]).toMatchObject({ ziel: ZIEL, punkte: 6.5, max: 12 });
    expect(await screen.findByText('Ergebnis gespeichert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ergebnis speichern' })).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      sichtbarkeit('visible');
      sichtbarkeit('hidden');
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(await pruefungen()).toHaveLength(1);
  });

  it('pagehide auf der Ergebnisseite speichert ebenfalls', async () => {
    await bisZurEinschaetzung();
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await waitFor(async () => expect(await pruefungen()).toHaveLength(1));
  });

  it('während des Schreibens speichert der Hintergrund nichts', async () => {
    await starte();
    await act(async () => {
      sichtbarkeit('hidden');
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(await pruefungen()).toHaveLength(0);
  });

  it('Rerender mit neuem Probe-Objekt (neu geladene Datei) speichert nicht vorzeitig', async () => {
    window.location.hash = PFAD;
    const idx = structuredClone(index);
    const f = fakeClient(idx);
    render(<App db={db} createClient={() => f.client} now={() => new Date('2026-11-22T12:00:00Z')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Starten' }));
    await screen.findByText(/Aufgabe 1 von 3/);
    await bearbeite();
    klick('Abgeben');
    await screen.findByRole('region', { name: 'Selbst einschätzen' });
    fireEvent.click(screen.getByRole('button', { name: /^Teilweise/ }));
    // Datei gilt als geändert: der nächste Abgleich lädt sie neu und liefert ein neues Probe-Objekt
    idx.faecher[0]!.proben[0]!.hash = 'neu';
    await act(async () => {
      sichtbarkeit('visible');
      await new Promise((r) => setTimeout(r, 50));
    });
    await waitFor(async () => expect((await getFile(db, idx.faecher[0]!.proben[0]!.pfad))?.hash).toBe('neu'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(await pruefungen()).toHaveLength(0);
    // Ergebnisseite und Einschätzung sind noch da
    expect(screen.getByText('6,5 von 12')).toBeInTheDocument();
    klick('Ergebnis speichern');
    await waitFor(async () => expect(await pruefungen()).toHaveLength(1));
  });
});
