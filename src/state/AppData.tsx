import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { IndexSubject, LernIndex, Topic } from '../format/types';
import { loadTopic, syncContent } from '../lib/contentSync';
import { getAllEvents, getFile, getSetting, openLernDb, setSetting, type LernDatabase } from '../lib/db';
import { createGitHubClient, GitHubError, type GitHubClient } from '../lib/github';
import { dueCards, replayCards, type Ereignis } from '../lib/progress';
import { normalizeGeraet, recordEvent, syncProgress } from '../lib/progressSync';

export type Theme = 'dunkel' | 'hell';
type OhneMeta<T> = T extends unknown ? Omit<T, 'zeit' | 'geraet'> : never;
/** Was Aufrufer an record() geben: geraet und zeit füllt der Kontext selbst. */
export type NeuesEreignis = OhneMeta<Ereignis>;

export interface SyncStatus {
  laeuft: boolean;
  offline: boolean;
  /** `erstellt` des zuletzt bekannten Index (ISO), null ohne Daten */
  stand: string | null;
  fehler?: GitHubError;
}

export interface AppData {
  /** Einstellungen und Cache sind geladen */
  bereit: boolean;
  hatToken: boolean;
  geraet: string | null;
  theme: Theme;
  index: LernIndex | null;
  topics: (pfad: string) => Topic | null;
  kartenZustand: Map<string, FsrsCard>;
  ereignisse: Ereignis[];
  faellig: string[];
  syncStatus: SyncStatus;
  sync(): Promise<void>;
  record(e: NeuesEreignis): Promise<void>;
  /** Prüft ein (neues oder das gespeicherte) Token; wirft GitHubError. */
  pruefeVerbindung(token?: string): Promise<void>;
  speichereZugang(z: { token?: string; geraet: string }): Promise<void>;
  setzeTheme(t: Theme): Promise<void>;
}

export interface AppDataProviderProps {
  children: ReactNode;
  /** Für Tests: eigene DB statt `openLernDb()` */
  db?: LernDatabase;
  /** Für Tests: Fake-Client statt GitHub */
  createClient?: (token: string) => GitHubClient;
  now?: () => Date;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData() braucht einen AppDataProvider.');
  return v;
}

/** Pfade aller Themen eines Fachs, die Unterlagen haben. */
export function themenPfade(fach: IndexSubject): string[] {
  return [...fach.kapitel.flatMap((k) => k.themen), ...fach.nichtZugeordnet].flatMap((t) => (t.pfad === null ? [] : [t.pfad]));
}

/** IDs aller aktiven (nicht zurückgezogenen) Karten mit ID. */
export function aktiveKartenIds(topic: Topic): string[] {
  return topic.karten.flatMap((k) => (k.id && !k.zurueckgezogen ? [k.id] : []));
}

async function cachedIndex(db: LernDatabase): Promise<LernIndex | null> {
  const f = await getFile(db, 'index.json');
  if (!f) return null;
  try {
    return JSON.parse(f.text) as LernIndex;
  } catch {
    return null;
  }
}

/** Lädt die Themen des Index aus dem Cache; unveränderte (nicht in `geaendert`) werden aus `alt` übernommen. */
async function ladeThemen(db: LernDatabase, index: LernIndex, alt: Map<string, Topic>, geaendert: string[] | null) {
  const neu = new Map<string, Topic>();
  const geaendertSet = geaendert ? new Set(geaendert) : null;
  for (const pfad of index.faecher.flatMap(themenPfade)) {
    const vorher = alt.get(pfad);
    if (vorher && geaendertSet && !geaendertSet.has(pfad)) {
      neu.set(pfad, vorher);
      continue;
    }
    const t = await loadTopic(db, pfad);
    if (t) neu.set(pfad, t);
  }
  return neu;
}

const alsGitHubError = (e: unknown) => (e instanceof GitHubError ? e : new GitHubError('other'));
const ladeEreignisse = async (db: LernDatabase) => (await getAllEvents(db)) as Ereignis[];

export function AppDataProvider({ children, db: dbProp, createClient = createGitHubClient, now = () => new Date() }: AppDataProviderProps) {
  const [bereit, setBereit] = useState(false);
  const [zugang, setZugang] = useState<{ token: string | null; geraet: string | null }>({ token: null, geraet: null });
  const [theme, setTheme] = useState<Theme>('dunkel');
  const [index, setIndex] = useState<LernIndex | null>(null);
  const [themen, setThemen] = useState<Map<string, Topic>>(new Map());
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ laeuft: false, offline: false, stand: null });

  // Refs: sync()/record() lesen immer den aktuellen Stand, auch direkt nach speichereZugang().
  const dbRef = useRef<LernDatabase | null>(null);
  const zugangRef = useRef(zugang);
  const themenRef = useRef(themen);
  const laufenderSync = useRef<Promise<void> | null>(null);
  const fortschrittKette = useRef<Promise<unknown>>(Promise.resolve());
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;
  const nowRef = useRef(now);
  nowRef.current = now;

  /** Fortschritts-Abgleich nacheinander, nie parallel (sonst Konflikte auf derselben Datei). */
  const fortschrittAbgleichen = useCallback((client: GitHubClient, db: LernDatabase, geraet: string) => {
    const lauf = fortschrittKette.current.then(() => syncProgress(client, db, geraet));
    fortschrittKette.current = lauf.catch(() => undefined);
    return lauf;
  }, []);

  const sync = useCallback((): Promise<void> => {
    if (laufenderSync.current) return laufenderSync.current;
    const db = dbRef.current;
    const { token, geraet } = zugangRef.current;
    if (!db || !token) return Promise.resolve();
    const client = createClientRef.current(token);
    const lauf = (async () => {
      setSyncStatus((s) => ({ ...s, laeuft: true }));
      try {
        const r = await syncContent(client, db);
        const neueThemen = await ladeThemen(db, r.index, themenRef.current, r.geaendert);
        let offline = r.offline;
        let fehler: GitHubError | undefined;
        if (geraet && !r.offline) {
          try {
            offline = (await fortschrittAbgleichen(client, db, geraet)).offline;
          } catch (e) {
            fehler = alsGitHubError(e);
          }
        }
        const ev = await ladeEreignisse(db);
        themenRef.current = neueThemen;
        setIndex(r.index);
        setThemen(neueThemen);
        setEreignisse(ev);
        setSyncStatus({ laeuft: false, offline, stand: r.stand, fehler });
      } catch (e) {
        setSyncStatus((s) => ({ ...s, laeuft: false, fehler: alsGitHubError(e) }));
      } finally {
        laufenderSync.current = null;
      }
    })();
    laufenderSync.current = lauf;
    return lauf;
  }, [fortschrittAbgleichen]);

  // Start: DB öffnen, Einstellungen und Cache laden, dann abgleichen.
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const db = dbProp ?? (await openLernDb());
      const [token, geraet, gespeichertesTheme, idx, ev] = await Promise.all([
        getSetting(db, 'token'),
        getSetting(db, 'geraet'),
        getSetting(db, 'theme'),
        cachedIndex(db),
        ladeEreignisse(db),
      ]);
      const t = idx ? await ladeThemen(db, idx, new Map(), null) : new Map<string, Topic>();
      if (abgebrochen) return;
      dbRef.current = db;
      const z = { token: typeof token === 'string' && token ? token : null, geraet: typeof geraet === 'string' && geraet ? geraet : null };
      zugangRef.current = z;
      themenRef.current = t;
      setZugang(z);
      setTheme(gespeichertesTheme === 'hell' ? 'hell' : 'dunkel');
      setIndex(idx);
      setThemen(t);
      setEreignisse(ev);
      setSyncStatus({ laeuft: false, offline: false, stand: idx?.erstellt ?? null });
      setBereit(true);
      void sync();
    })().catch(() => {
      // IndexedDB nicht nutzbar (z. B. privater Modus): nicht ewig „Lädt …“ zeigen
      if (abgebrochen) return;
      setSyncStatus({ laeuft: false, offline: false, stand: null, fehler: new GitHubError('other') });
      setBereit(true);
    });
    return () => {
      abgebrochen = true;
    };
  }, [dbProp, sync]);

  // Wieder sichtbar → abgleichen.
  useEffect(() => {
    const beiSichtbar = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    document.addEventListener('visibilitychange', beiSichtbar);
    return () => document.removeEventListener('visibilitychange', beiSichtbar);
  }, [sync]);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'hell') html.setAttribute('data-theme', 'light');
    else html.removeAttribute('data-theme');
  }, [theme]);

  const record = useCallback(
    async (e: NeuesEreignis) => {
      const db = dbRef.current;
      const { token, geraet } = zugangRef.current;
      if (!db || !geraet) throw new Error('Noch kein Gerätename eingerichtet.');
      await recordEvent(db, { ...e, geraet, zeit: new Date().toISOString() } as Ereignis);
      setEreignisse(await ladeEreignisse(db));
      if (!token) return;
      // Hochladen im Hintergrund: Fehler landen nur im syncStatus.
      void fortschrittAbgleichen(createClientRef.current(token), db, geraet).then(
        async (r) => {
          setEreignisse(await ladeEreignisse(db));
          setSyncStatus((s) => ({ ...s, offline: r.offline, fehler: undefined }));
        },
        (err) => setSyncStatus((s) => ({ ...s, fehler: alsGitHubError(err) })),
      );
    },
    [fortschrittAbgleichen],
  );

  const pruefeVerbindung = useCallback(async (token?: string) => {
    const t = token || zugangRef.current.token;
    if (!t) throw new GitHubError('auth');
    await createClientRef.current(t).testAccess();
  }, []);

  const speichereZugang = useCallback(async ({ token, geraet }: { token?: string; geraet: string }) => {
    const db = dbRef.current;
    if (!db) throw new Error('Datenbank noch nicht bereit.');
    const g = normalizeGeraet(geraet);
    if (token) await setSetting(db, 'token', token);
    await setSetting(db, 'geraet', g);
    const z = { token: token || zugangRef.current.token, geraet: g };
    zugangRef.current = z;
    setZugang(z);
  }, []);

  const setzeTheme = useCallback(async (t: Theme) => {
    setTheme(t);
    if (dbRef.current) await setSetting(dbRef.current, 'theme', t);
  }, []);

  const kartenZustand = useMemo(() => replayCards(ereignisse), [ereignisse]);
  const faellig = useMemo(() => {
    const ids = [...themen.values()].flatMap(aktiveKartenIds);
    return dueCards(kartenZustand, ids, nowRef.current());
    // syncStatus: nach jedem Abgleich neu gegen die aktuelle Zeit rechnen
  }, [kartenZustand, themen, syncStatus]);
  const topics = useCallback((pfad: string) => themen.get(pfad) ?? null, [themen]);

  const wert = useMemo<AppData>(
    () => ({
      bereit,
      hatToken: zugang.token !== null,
      geraet: zugang.geraet,
      theme,
      index,
      topics,
      kartenZustand,
      ereignisse,
      faellig,
      syncStatus,
      sync,
      record,
      pruefeVerbindung,
      speichereZugang,
      setzeTheme,
    }),
    [bereit, zugang, theme, index, topics, kartenZustand, ereignisse, faellig, syncStatus, sync, record, pruefeVerbindung, speichereZugang, setzeTheme],
  );

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}
