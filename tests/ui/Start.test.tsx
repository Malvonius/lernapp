import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { syncContent } from '../../src/lib/contentSync';
import { getAllEvents, openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { GitHubError } from '../../src/lib/github';
import { recordEvent } from '../../src/lib/progressSync';
import { useAppData } from '../../src/state/AppData';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  window.location.hash = '';
  db = await openLernDb(`start-${n++}`);
});

async function mitZugang() {
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
}

describe('Startseite', () => {
  it('ohne Token zeigt die App „Einrichten“', async () => {
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByRole('heading', { name: 'Einrichten' })).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub-Token')).toHaveAttribute('type', 'password');
  });

  it('mit Token zeigt sie nach dem Sync die Fach-Kachel und die fälligen Karten', async () => {
    await mitZugang();
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
    const kachel = await screen.findByRole('link', { name: /Angewandte Mathematik/ });
    expect(kachel).toHaveAttribute('href', '#/fach/mathe');
    expect(kachel).toHaveTextContent(/2 Themen/);
    // 3 aktive Karten mit ID in den Fixtures (die zurückgezogene zählt nicht)
    const wiederholen = screen.getByRole('link', { name: 'Jetzt wiederholen (0 fällig · 3 neu)' });
    expect(wiederholen).toHaveAttribute('href', '#/wiederholen');
    expect(screen.getByRole('link', { name: 'Prüfung starten' })).toHaveAttribute('href', '#/pruefung');
  });

  it('die Kachel zeigt den Anteil der Themen je Ampel-Status (wie die Fachansicht)', async () => {
    await mitZugang();
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
    await screen.findByRole('link', { name: /Angewandte Mathematik/ });
    expect(screen.getByRole('img', { name: '2 neu, 1 Lücke' })).toBeInTheDocument();
  });

  it('Sync wirft auth → Fehlermeldung mit Link zu den Einstellungen', async () => {
    await mitZugang();
    const { client } = fakeClient(index, { fail: new GitHubError('auth', 401) });
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByText('Token ungültig oder ohne Zugriff')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '#/einstellungen');
  });

  it('index.json 404 (Token ohne Repo-Zugriff) → Hinweis auf „Repository access“ mit Link zu den Einstellungen', async () => {
    await mitZugang();
    const { client } = fakeClient(index, { fail: new GitHubError('notfound', 404) });
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByText('Token ohne Zugriff auf Malvonius/lernstoff – unter „Repository access“ das Repo auswählen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '#/einstellungen');
  });

  it('IndexedDB nicht nutzbar → „Lokaler Speicher nicht verfügbar (privater Modus?)“', async () => {
    const kaputt = { get: () => Promise.reject(new DOMException('x', 'InvalidStateError')) } as unknown as LernDatabase;
    render(<App db={kaputt} createClient={() => fakeClient(index).client} />);
    expect(await screen.findByText('Lokaler Speicher nicht verfügbar (privater Modus?)')).toBeInTheDocument();
  });

  it('Ratelimit → eigene Meldung', async () => {
    await mitZugang();
    const { client } = fakeClient(index, { fail: new GitHubError('ratelimit', 403) });
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByText('GitHub-Limit erreicht, später nochmal versuchen')).toBeInTheDocument();
  });

  it('offline ohne Cache → „Keine Verbindung und noch keine Daten gespeichert“', async () => {
    await mitZugang();
    const { client } = fakeClient(index, { fail: new GitHubError('network') });
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByText('Keine Verbindung und noch keine Daten gespeichert')).toBeInTheDocument();
  });

  it('offline mit Cache → Banner „offline“ und die Kachel aus dem Cache', async () => {
    await mitZugang();
    await syncContent(fakeClient(index).client, db);
    const { client } = fakeClient(index, { fail: new GitHubError('network') });
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByRole('status')).toHaveTextContent(/offline, Stand/);
    expect(screen.getByRole('link', { name: /Angewandte Mathematik/ })).toBeInTheDocument();
  });
});

describe('Abgleich: Inhalt und Fortschritt unabhängig', () => {
  it('ein Thema scheitert (500): Rest wird angezeigt, kein Fehler-Banner, Thema „fehlerhaft“', async () => {
    await mitZugang();
    const { client } = fakeClient(index);
    const kaputt = 'Mathe/01 Analysis/Ableitungen.md';
    const c = { ...client, getRaw: (p: string, e?: string) => (p === kaputt ? Promise.reject(new GitHubError('other', 500)) : client.getRaw(p, e)) };
    window.location.hash = '#/fach/mathe';
    render(<App db={db} createClient={() => c} now={() => new Date('2026-11-22T12:00:00Z')} />);
    expect(await screen.findByRole('button', { name: /Ableitungen/ })).toHaveTextContent(/fehlerhaft/);
    expect(screen.getByRole('link', { name: /Taylor/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Inhalts-Abgleich scheitert (index.json 500): Fortschritt wird trotzdem hochgeladen', async () => {
    await mitZugang();
    await recordEvent(db, { art: 'karte', ziel: 'k-a1b2c3', bewertung: 3, geraet: 'pc', zeit: '2026-11-22T10:00:00.000Z' });
    const { client, state } = fakeClient(index);
    const c = { ...client, getRaw: (p: string, e?: string) => (p === 'index.json' ? Promise.reject(new GitHubError('other', 500)) : client.getRaw(p, e)) };
    render(<App db={db} createClient={() => c} />);
    expect(await screen.findByText('GitHub hat einen Fehler gemeldet.')).toBeInTheDocument();
    await waitFor(() => expect(state.puts).toEqual(['_fortschritt/pc.json']));
  });

  it('offline: kein Fortschritts-Abgleich', async () => {
    await mitZugang();
    await syncContent(fakeClient(index).client, db);
    await recordEvent(db, { art: 'karte', ziel: 'k-a1b2c3', bewertung: 3, geraet: 'pc', zeit: '2026-11-22T10:00:00.000Z' });
    const { client } = fakeClient(index, { fail: new GitHubError('network') });
    let listDir = 0;
    const c = { ...client, listDir: (p: string) => (listDir++, client.listDir(p)) };
    render(<App db={db} createClient={() => c} />);
    expect(await screen.findByRole('status')).toHaveTextContent(/offline/);
    expect(listDir).toBe(0);
  });
});

describe('Abgleich beim Sichtbarwerden', () => {
  it('visibilitychange → visible startet einen neuen Sync', async () => {
    await mitZugang();
    let indexAbrufe = 0;
    const { client } = fakeClient(index);
    const zaehlend = { ...client, getRaw: (p: string, e?: string) => ((p === 'index.json' && indexAbrufe++), client.getRaw(p, e)) };
    render(<App db={db} createClient={() => zaehlend} />);
    await screen.findByRole('link', { name: /Angewandte Mathematik/ });
    expect(indexAbrufe).toBe(1);
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(indexAbrufe).toBe(2));
    await screen.findByRole('link', { name: /Angewandte Mathematik/ });
  });
});

function Bewerter() {
  const { record, faellig, ereignisse, index: idx, syncStatus } = useAppData();
  return (
    <div>
      <p>fällig: {faellig.length}</p>
      <p>ereignisse: {ereignisse.length}</p>
      <p>{syncStatus.stand ? 'Abgleich fertig' : 'noch kein Abgleich'}</p>
      <button type="button" disabled={!idx} onClick={() => void record({ art: 'karte', ziel: 'k-a1b2c3', bewertung: 3 })}>
        bewerten
      </button>
    </div>
  );
}

describe('useAppData().record', () => {
  it('füllt geraet und zeit, aktualisiert fällig und lädt im Hintergrund hoch', async () => {
    await mitZugang();
    const { client, state } = fakeClient(index);
    const { AppDataProvider } = await import('../../src/state/AppData');
    render(
      <AppDataProvider db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')}>
        <Bewerter />
      </AppDataProvider>,
    );
    const knopf = await screen.findByRole('button', { name: 'bewerten' });
    await waitFor(() => expect(knopf).toBeEnabled());
    expect(screen.getByText('fällig: 3')).toBeInTheDocument();
    knopf.click();
    expect(await screen.findByText('fällig: 2')).toBeInTheDocument();
    expect(screen.getByText('ereignisse: 1')).toBeInTheDocument();
    // hochgeladen wird erst nach 60 s ohne weitere Bewertung (siehe „Hochladen entprellt“)
    expect(state.puts).toEqual([]);
    const [e] = await getAllEvents(db);
    expect(e).toMatchObject({ art: 'karte', ziel: 'k-a1b2c3', geraet: 'pc', bewertung: 3 });
    expect(new Date(e!.zeit).toISOString()).toBe(e!.zeit);
  });
});

describe('Hochladen entprellt', () => {
  afterEach(() => vi.useRealTimers());

  async function bereit() {
    await mitZugang();
    const f = fakeClient(index);
    let indexAbrufe = 0;
    const client = { ...f.client, getRaw: (p: string, e?: string) => ((p === 'index.json' && indexAbrufe++), f.client.getRaw(p, e)) };
    const { AppDataProvider } = await import('../../src/state/AppData');
    render(
      <AppDataProvider db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')}>
        <Bewerter />
      </AppDataProvider>,
    );
    const knopf = await screen.findByRole('button', { name: 'bewerten' });
    await waitFor(() => expect(knopf).toBeEnabled());
    await waitFor(() => expect(indexAbrufe).toBe(1));
    // erster Abgleich fertig (stand wird erst an seinem Ende gesetzt), sonst würde ein zweiter mit ihm zusammengelegt
    await screen.findByText('Abgleich fertig');
    return { knopf, state: f.state, indexAbrufe: () => indexAbrufe };
  }

  it('5 schnelle Bewertungen: sofort kein PUT, nach 60 s Leerlauf genau einer', async () => {
    const { knopf, state } = await bereit();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (let i = 0; i < 5; i++) {
      knopf.click();
      await vi.waitFor(async () => expect((await getAllEvents(db)).length).toBeGreaterThan(0));
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(state.puts).toEqual([]);
    await vi.advanceTimersByTimeAsync(54_000); // 59 s nach der letzten Bewertung
    expect(state.puts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(state.puts).toEqual(['_fortschritt/pc.json']));
  });

  it('App in den Hintergrund (visibilitychange → hidden) lädt sofort hoch', async () => {
    const { knopf, state } = await bereit();
    knopf.click();
    await screen.findByText('ereignisse: 1');
    expect(state.puts).toEqual([]);
    const sichtbar = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(state.puts).toEqual(['_fortschritt/pc.json']));
    sichtbar.mockRestore();
  });

  it('online-Event löst einen Abgleich aus', async () => {
    const { indexAbrufe } = await bereit();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(indexAbrufe()).toBe(2));
  });

  it('nichts ausstehend: hidden macht keine Anfrage', async () => {
    const { state } = await bereit();
    const sichtbar = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 30));
    expect(state.puts).toEqual([]);
    sichtbar.mockRestore();
  });
});
