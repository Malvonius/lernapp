import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`fach-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});

async function oeffne(idx: LernIndex, hash = '#/fach/mathe') {
  window.location.hash = hash;
  const { client } = fakeClient(idx);
  render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
  return screen.findByRole('heading', { level: 1, name: /Angewandte Mathematik/ });
}

describe('Fachansicht', () => {
  it('zeigt Kapitel und Themen mit Ampel; die Lücke „Kurvendiskussion“ ist grau und nicht anklickbar', async () => {
    await oeffne(index);
    expect(await screen.findByRole('heading', { level: 2, name: /Analysis/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Reihen/ })).toBeInTheDocument();
    expect(screen.getByText('noch keine Unterlagen')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Kurvendiskussion/ })).toBeNull();
    const ableitungen = screen.getByRole('link', { name: /Ableitungen/ });
    expect(ableitungen).toHaveAttribute('href', '#/thema/mathe/mathe-ableitungen');
    expect(ableitungen).toHaveTextContent(/2 Karten/);
    expect(ableitungen).toHaveTextContent(/4 Übungen/);
    // nichts bewertet → „neu“ mit Textlabel, nicht nur Farbe
    expect(within(ableitungen).getByText('neu')).toBeInTheDocument();
  });

  it('vorläufige Gliederung wird angezeigt', async () => {
    await oeffne(index);
    expect(await screen.findByText(/vorläufige Gliederung/)).toBeInTheDocument();
  });

  it('fehlerhaftes Thema: Label „fehlerhaft“, nicht anklickbar, Erklärung auf Tipp; die anderen bleiben Links', async () => {
    const kaputt: LernIndex = structuredClone(index);
    kaputt.faecher[0]!.kapitel[0]!.themen[0]!.fehler = ['Kartenzeile ohne Antwort'];
    await oeffne(kaputt);
    const knopf = await screen.findByRole('button', { name: /Ableitungen.*fehlerhaft/ });
    expect(screen.queryByRole('link', { name: /Ableitungen/ })).toBeNull();
    expect(screen.queryByText(/Bob korrigiert das/)).toBeNull();
    fireEvent.click(knopf);
    expect(screen.getByText('Datei hat Formatfehler, Bob korrigiert das')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Taylorreihen und DG/ })).toHaveAttribute('href', expect.stringMatching(/^#\/thema\/mathe\//));
  });

  it('unbekanntes Fach → Hinweis mit Link zur Startseite', async () => {
    window.location.hash = '#/fach/gibtsnicht';
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByText('Fach nicht gefunden')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '#/');
  });
});
