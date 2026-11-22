import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { syncContent } from '../../src/lib/contentSync';
import { getAllEvents, openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { GitHubError } from '../../src/lib/github';
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
    const wiederholen = screen.getByRole('link', { name: 'Jetzt wiederholen (3 fällig)' });
    expect(wiederholen).toHaveAttribute('href', '#/wiederholen');
    expect(screen.getByRole('link', { name: 'Prüfung starten' })).toHaveAttribute('href', '#/pruefung');
  });

  it('Sync wirft auth → Fehlermeldung mit Link zu den Einstellungen', async () => {
    await mitZugang();
    const { client } = fakeClient(index, { fail: new GitHubError('auth', 401) });
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByText('Token ungültig oder ohne Zugriff')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '#/einstellungen');
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
  const { record, faellig, ereignisse, index: idx } = useAppData();
  return (
    <div>
      <p>fällig: {faellig.length}</p>
      <p>ereignisse: {ereignisse.length}</p>
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
    await waitFor(() => expect(state.puts).toEqual(['_fortschritt/pc.json']));
    const [e] = await getAllEvents(db);
    expect(e).toMatchObject({ art: 'karte', ziel: 'k-a1b2c3', geraet: 'pc', bewertung: 3 });
    expect(new Date(e!.zeit).toISOString()).toBe(e!.zeit);
  });
});
