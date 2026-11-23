import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { getAllEvents, openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`pruefung-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});
afterEach(() => {
  vi.useRealTimers();
});

/** Seedbarer Zufall (mulberry32): jeder Test zieht dieselben Aufgaben in derselben Reihenfolge. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function oeffneUndWaehle(limit?: string, seed = 7, themaId?: string) {
  window.location.hash = '#/pruefung';
  const f = fakeClient(index);
  // optional: Ableitungen bekommt eine ID mit Sonderzeichen (prüft das Codieren der Links)
  const client = themaId
    ? { ...f.client, getRaw: async (p: string, e?: string) => {
        const r = await f.client.getRaw(p, e);
        return p.endsWith('Ableitungen.md') && r !== 'unchanged' ? { ...r, text: r.text.replace('id: mathe-ableitungen', `id: "${themaId}"`) } : r;
      } }
    : f.client;
  render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} zufall={seeded(seed)} />);
  const start = await screen.findByRole('button', { name: 'Prüfung starten' });
  expect(start).toBeDisabled(); // ohne Fach und Kapitel
  fireEvent.click(await screen.findByRole('radio', { name: /Mathe/ }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Analysis/ }));
  if (limit) fireEvent.change(screen.getByLabelText('Zeitlimit'), { target: { value: limit } });
  expect(start).toBeEnabled();
  fireEvent.click(start);
}

const klick = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

/** Bearbeitet die Aufgaben der Reihe nach, egal in welcher Reihenfolge. Die erste Karte wird „nicht gewusst“, die Offen-Übung „nicht gekonnt“. */
async function arbeiteAb() {
  let ersteKarte = true;
  for (let i = 0; i < 10; i++) {
    await waitFor(() => {
      if (!document.querySelector('.lernkarte, .uebung') && !screen.queryByRole('heading', { name: 'Auswertung' })) throw new Error('warten');
    });
    if (screen.queryByRole('heading', { name: 'Auswertung' })) return;
    if (document.querySelector('.lernkarte')) {
      klick('Antwort zeigen');
      klick(ersteKarte ? 'Nicht gewusst' : 'Gewusst');
      ersteKarte = false;
      continue;
    }
    if (screen.queryByLabelText('Deine Antwort')) {
      fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '12' } });
      klick('Prüfen');
    } else if (screen.queryByRole('button', { name: 'Nächsten Schritt zeigen' })) {
      for (let s = 0; s < 3; s++) klick('Nächsten Schritt zeigen');
      klick('Hab ich gekonnt');
    } else if (screen.queryAllByRole('checkbox').length > 0) {
      const boxen = screen.getAllByRole('checkbox');
      fireEvent.click(boxen[0]!);
      fireEvent.click(boxen[1]!);
      klick('Prüfen');
    } else {
      klick('Musterlösung zeigen');
      klick('Nicht gekonnt');
    }
    fireEvent.click(await screen.findByRole('button', { name: /^(Weiter|Zur Auswertung)$/ }));
  }
}

describe('Prüfung', () => {
  it('Durchlauf: Auswertung „4 von 6“, Kapitel, falsche Aufgaben mit Link, Ereignisse', async () => {
    await oeffneUndWaehle();
    await arbeiteAb();
    expect(await screen.findByRole('heading', { name: 'Auswertung' })).toBeInTheDocument();
    expect(screen.getAllByText('4 von 6').length).toBeGreaterThan(0);
    expect(screen.getByText(/4 von 6 \(67 %\)/)).toBeInTheDocument();

    const falsch = screen.getByRole('heading', { name: 'Nochmal ansehen' }).nextElementSibling as HTMLElement;
    expect(within(falsch).getAllByRole('link', { name: 'Zum Thema' })).toHaveLength(2);
    expect(within(falsch).getAllByRole('link', { name: 'Zum Thema' })[0]).toHaveAttribute('href', '#/thema/mathe/mathe-ableitungen');

    await waitFor(async () => expect((await getAllEvents(db)).filter((e) => e.art === 'pruefung')).toHaveLength(1));
    const ev = await getAllEvents(db);
    expect(ev.find((e) => e.art === 'pruefung')).toMatchObject({ ziel: 'mathe:01 Analysis', punkte: 4, max: 6, geraet: 'pc' });
    // genau eine Karte „nicht gewusst“ → bewertung 1; gewusste Karten schreiben nichts
    expect(ev.filter((e) => e.art === 'karte')).toHaveLength(1);
    expect(ev.find((e) => e.art === 'karte')).toMatchObject({ bewertung: 1 });
    // Übungen zählen als normale Versuche
    expect(ev.filter((e) => e.art === 'uebung')).toHaveLength(4);
  });

  it('Zeitlimit: nach Ablauf zählen offene Aufgaben als falsch und die Auswertung erscheint', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await oeffneUndWaehle('15');
    expect(await screen.findByText(/Noch 15:00/)).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000 + 1000);
    });
    vi.useRealTimers();
    expect(await screen.findByRole('heading', { name: 'Auswertung' })).toBeInTheDocument();
    expect(screen.getAllByText('0 von 6').length).toBeGreaterThan(0);
    expect(screen.getByText(/Die Zeit ist abgelaufen/)).toBeInTheDocument();
    await waitFor(async () => expect((await getAllEvents(db)).find((e) => e.art === 'pruefung')).toMatchObject({ punkte: 0, max: 6 }));
  });
});

describe('Prüfung: Links', () => {
  it('„Zum Thema“ codiert die Themen-ID (encodeURIComponent)', async () => {
    await oeffneUndWaehle(undefined, 7, 'abl?eitungen');
    await arbeiteAb();
    const falsch = (await screen.findByRole('heading', { name: 'Nochmal ansehen' })).nextElementSibling as HTMLElement;
    const hrefs = within(falsch).getAllByRole('link', { name: 'Zum Thema' }).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#/thema/mathe/abl%3Feitungen');
  });
});

describe('Prüfung: Zufall', () => {
  /** Text der aktuellen Aufgabe (Karte oder Übung) */
  const aufgabe = async () => {
    await waitFor(() => {
      if (!document.querySelector('.lernkarte, .uebung')) throw new Error('warten');
    });
    return (document.querySelector('.lernkarte, .uebung') as HTMLElement).textContent;
  };

  it('nutzt den injizierten Zufall statt Math.random: gleicher Seed → gleiche erste Aufgabe', async () => {
    const random = vi.spyOn(Math, 'random');
    await oeffneUndWaehle(undefined, 1);
    const erste = await aufgabe();
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    cleanup();
    db = await openLernDb(`pruefung-${n++}`);
    await setSetting(db, 'token', 'test-token');
    await setSetting(db, 'geraet', 'pc');
    await oeffneUndWaehle(undefined, 1);
    expect(await aufgabe()).toBe(erste);
  });
});

describe('Frag Bob in der Prüfung', () => {
  it('nur bei Übungen und erst nach der Antwort', async () => {
    await oeffneUndWaehle();
    // bis zur ersten Übung durcharbeiten (Karten werden übersprungen)
    for (let i = 0; i < 10; i++) {
      await waitFor(() => {
        if (!document.querySelector('.lernkarte, .uebung')) throw new Error('warten');
      });
      if (document.querySelector('.uebung')) break;
      klick('Antwort zeigen');
      klick('Gewusst');
    }
    expect(document.querySelector('.uebung')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Frag Bob' })).toBeNull();
    if (screen.queryByLabelText('Deine Antwort')) {
      fireEvent.change(screen.getByLabelText('Deine Antwort'), { target: { value: '12' } });
      klick('Prüfen');
    } else if (screen.queryByRole('button', { name: 'Nächsten Schritt zeigen' })) {
      for (let s = 0; s < 3; s++) klick('Nächsten Schritt zeigen');
      klick('Hab ich gekonnt');
    } else if (screen.queryAllByRole('checkbox').length > 0) {
      fireEvent.click(screen.getAllByRole('checkbox')[0]!);
      klick('Prüfen');
    } else {
      klick('Musterlösung zeigen');
      klick('Hab ich gekonnt');
    }
    expect(await screen.findByRole('button', { name: 'Frag Bob' })).toBeInTheDocument();
  });
});
