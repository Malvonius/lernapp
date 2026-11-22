import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { getAllEvents, openLernDb, type LernDatabase, setSetting } from '../../src/lib/db';
import { formatIntervall } from '../../src/lib/progress';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`wiederholen-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});

async function oeffne(hash = '#/wiederholen') {
  window.location.hash = hash;
  const { client } = fakeClient(index);
  render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
}

const aufdecken = () => fireEvent.click(screen.getByRole('button', { name: 'Antwort zeigen' }));
const bewerten = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('Wiederholen', () => {
  it('Antwort zeigen, dann „Gut“ → genau ein Ereignis mit bewertung 3, danach die nächste Karte', async () => {
    await oeffne();
    expect(await screen.findByText(/Was ist die Ableitung von/)).toBeInTheDocument();
    expect(screen.queryByText(/n-1/)).toBeNull();
    aufdecken();
    expect(await screen.findByText(/Gut/)).toBeInTheDocument();
    bewerten(/^Gut/);
    expect(await screen.findByText(/Wie lautet die Kettenregel/)).toBeInTheDocument();
    const ev = await getAllEvents(db);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ art: 'karte', ziel: 'k-a1b2c3', bewertung: 3, geraet: 'pc' });
  });

  it('zeigt unter jedem Knopf das nächste Intervall', async () => {
    await oeffne();
    await screen.findByText(/Was ist die Ableitung von/);
    aufdecken();
    expect(screen.getByRole('button', { name: /^Nochmal\s*1 Min$/ })).toBeInTheDocument();
    for (const name of ['Schwer', 'Gut', 'Einfach']) {
      expect(screen.getByRole('button', { name: new RegExp(String.raw`^${name}\s*\d+ (Min|Std|Tage?|Mon)$`) })).toBeInTheDocument();
    }
  });

  it('„Nochmal“ legt die Karte ans Ende der Sitzung; nach der letzten Karte erscheint „Fertig“', async () => {
    await oeffne();
    await screen.findByText(/Was ist die Ableitung von/);
    aufdecken();
    bewerten(/^Nochmal/);
    await screen.findByText(/Wie lautet die Kettenregel/);
    aufdecken();
    bewerten(/^Gut/);
    await screen.findByText(/Taylorpolynoms/);
    aufdecken();
    bewerten(/^Einfach/);
    // jetzt kommt die erste Karte noch einmal
    await screen.findByText(/Was ist die Ableitung von/);
    aufdecken();
    bewerten(/^Gut/);
    expect(await screen.findByRole('heading', { name: 'Fertig' })).toBeInTheDocument();
    expect(screen.getByText(/4 Bewertungen/)).toBeInTheDocument();
    expect(await getAllEvents(db)).toHaveLength(4);
  });

  it('Tastatur: Leertaste deckt auf, Taste „1“ bewertet mit 1', async () => {
    await oeffne();
    await screen.findByText(/Was ist die Ableitung von/);
    fireEvent.keyDown(window, { key: '1' }); // vor dem Aufdecken wirkungslos
    expect(await getAllEvents(db)).toHaveLength(0);
    fireEvent.keyDown(window, { key: ' ' });
    expect(await screen.findByRole('button', { name: /^Nochmal/ })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '1' });
    await screen.findByText(/Wie lautet die Kettenregel/);
    const ev = await getAllEvents(db);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ ziel: 'k-a1b2c3', bewertung: 1 });
  });

  it('Tasten werden ignoriert, solange der Fokus in einem Eingabefeld ist', async () => {
    await oeffne();
    await screen.findByText(/Was ist die Ableitung von/);
    const feld = document.createElement('input');
    document.body.appendChild(feld);
    feld.focus();
    fireEvent.keyDown(feld, { key: ' ', bubbles: true });
    expect(screen.queryByRole('button', { name: /^Nochmal/ })).toBeNull();
    feld.remove();
  });

  it('?thema= nimmt alle aktiven Karten des Themas, auch nicht fällige', async () => {
    await oeffne('#/wiederholen?fach=mathe&thema=mathe-taylor-dg');
    expect(await screen.findByText(/Taylorpolynoms/)).toBeInTheDocument();
    aufdecken();
    bewerten(/^Gut/);
    expect(await screen.findByRole('heading', { name: 'Fertig' })).toBeInTheDocument();
    // Durchlernen: dieselbe Karte ist jetzt nicht mehr fällig, aber im Thema-Modus wieder dabei
    expect(await getAllEvents(db)).toHaveLength(1);
  });

  it('nichts fällig → „Alles erledigt“ mit Link zum Start', async () => {
    await oeffne('#/wiederholen?fach=gibtsnicht');
    expect(await screen.findByRole('heading', { name: 'Alles erledigt' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zum Start/ })).toHaveAttribute('href', '#/');
  });

  it('Start-Knopf zählt fällige und neue Karten getrennt', async () => {
    await oeffne('#/');
    expect(await screen.findByRole('link', { name: 'Jetzt wiederholen (0 fällig · 3 neu)' })).toHaveAttribute('href', '#/wiederholen');
  });
});

describe('formatIntervall', () => {
  it('formatiert kurz auf Deutsch', () => {
    const min = 60_000;
    expect(formatIntervall(30_000)).toBe('1 Min');
    expect(formatIntervall(10 * min)).toBe('10 Min');
    expect(formatIntervall(3 * 60 * min)).toBe('3 Std');
    expect(formatIntervall(24 * 60 * min)).toBe('1 Tag');
    expect(formatIntervall(4 * 24 * 60 * min)).toBe('4 Tage');
    expect(formatIntervall(60 * 24 * 60 * min)).toBe('2 Mon');
    expect(formatIntervall(400 * 24 * 60 * min)).toBe('1 Jahr');
  });
});
