import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { getSetting, openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { GitHubError } from '../../src/lib/github';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  window.location.hash = '';
  db = await openLernDb(`einst-${n++}`);
});
afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('Einrichten', () => {
  it('schlägt „pc“ als Gerätename vor und erklärt das fine-grained Token', async () => {
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByLabelText('Gerätename')).toHaveValue('pc');
    expect(screen.getByText(/Malvonius\/lernstoff/)).toBeInTheDocument();
    expect(screen.getByText(/Contents: Read and write/)).toBeInTheDocument();
  });

  it('„Verbindung prüfen“ testet das Token, speichert normalisiert und zeigt dann die Startseite', async () => {
    const seen: string[] = [];
    const { client, state } = fakeClient(index);
    render(<App db={db} createClient={(t) => (seen.push(t), client)} />);
    fireEvent.change(await screen.findByLabelText('GitHub-Token'), { target: { value: 'neues-token' } });
    fireEvent.change(screen.getByLabelText('Gerätename'), { target: { value: 'Mein Handy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung prüfen' }));
    expect(await screen.findByRole('link', { name: /Angewandte Mathematik/ })).toBeInTheDocument();
    expect(state.testAccessCalls).toBe(1);
    expect(seen).toContain('neues-token');
    expect(await getSetting(db, 'token')).toBe('neues-token');
    expect(await getSetting(db, 'geraet')).toBe('mein-handy');
  });

  it('abgelehntes Token wird nicht gespeichert', async () => {
    const { client } = fakeClient(index, { fail: new GitHubError('auth', 401) });
    render(<App db={db} createClient={() => client} />);
    fireEvent.change(await screen.findByLabelText('GitHub-Token'), { target: { value: 'falsch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung prüfen' }));
    expect(await screen.findByText('Token ungültig oder ohne Zugriff')).toBeInTheDocument();
    expect(await getSetting(db, 'token')).toBeUndefined();
    expect(screen.getByRole('heading', { name: 'Einrichten' })).toBeInTheDocument();
  });
});

describe('Einrichten: dauerhafter Speicher', () => {
  const setzeStorage = (wert: unknown) => Object.defineProperty(navigator, 'storage', { configurable: true, value: wert });
  afterEach(() => setzeStorage(undefined));

  const einrichten = async () => {
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    fireEvent.change(await screen.findByLabelText('GitHub-Token'), { target: { value: 'neues-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung prüfen' }));
    expect(await screen.findByRole('link', { name: /Angewandte Mathematik/ })).toBeInTheDocument();
  };

  it('nach erfolgreichem Einrichten wird navigator.storage.persist() angefragt', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setzeStorage({ persist });
    await einrichten();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('persist() wirft oder fehlt: Einrichten klappt trotzdem', async () => {
    setzeStorage({ persist: vi.fn().mockRejectedValue(new Error('nein')) });
    await einrichten();
    expect(await getSetting(db, 'token')).toBe('neues-token');
    cleanup();
    setzeStorage(undefined);
    db = await openLernDb(`einst-${n++}`);
    await einrichten();
  });

  it('abgelehntes Token: kein persist()', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setzeStorage({ persist });
    const { client } = fakeClient(index, { fail: new GitHubError('auth', 401) });
    render(<App db={db} createClient={() => client} />);
    fireEvent.change(await screen.findByLabelText('GitHub-Token'), { target: { value: 'falsch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung prüfen' }));
    await screen.findByText('Token ungültig oder ohne Zugriff');
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('Einrichten: Token ohne Repo-Zugriff', () => {
  it('testAccess 404 → Hinweis auf „Repository access“, Token nicht gespeichert', async () => {
    const { client } = fakeClient(index, { fail: new GitHubError('notfound', 404) });
    render(<App db={db} createClient={() => client} />);
    fireEvent.change(await screen.findByLabelText('GitHub-Token'), { target: { value: 'ohne-repo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung prüfen' }));
    expect(await screen.findByText('Token ohne Zugriff auf Malvonius/lernstoff – unter „Repository access“ das Repo auswählen')).toBeInTheDocument();
    expect(await getSetting(db, 'token')).toBeUndefined();
  });
});

describe('Einstellungen', () => {
  beforeEach(async () => {
    await setSetting(db, 'token', 'test-token');
    await setSetting(db, 'geraet', 'pc');
    window.location.hash = '#/einstellungen';
  });

  it('Theme-Schalter setzt data-theme="light" und speichert „hell“', async () => {
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    const schalter = await screen.findByRole('switch', { name: 'Helles Design' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeEnabled());
    fireEvent.click(schalter);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    expect(await getSetting(db, 'theme')).toBe('hell');
    fireEvent.click(schalter);
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute('data-theme'));
    expect(await getSetting(db, 'theme')).toBe('dunkel');
  });

  it('gespeichertes helles Theme wird beim Start angewendet', async () => {
    await setSetting(db, 'theme', 'hell');
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jetzt synchronisieren' })).toBeEnabled());
  });

  it('„Jetzt synchronisieren“ gleicht erneut ab', async () => {
    let aufrufe = 0;
    const { client } = fakeClient(index);
    const zaehlend = { ...client, getRaw: (p: string, e?: string) => ((p === 'index.json' && aufrufe++), client.getRaw(p, e)) };
    render(<App db={db} createClient={() => zaehlend} />);
    const knopf = await screen.findByRole('button', { name: 'Jetzt synchronisieren' });
    await waitFor(() => expect(knopf).toBeEnabled());
    expect(aufrufe).toBe(1);
    fireEvent.click(knopf);
    await waitFor(() => expect(aufrufe).toBe(2));
    await waitFor(() => expect(knopf).toBeEnabled());
  });
});
