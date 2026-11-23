import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { IndexSubject, LernIndex, Topic } from '../format/types';
import { loadTopic, syncContent } from '../lib/contentSync';
import { getAllEvents, getFile, getOutbox, getSetting, openLernDb, setSetting, type LernDatabase } from '../lib/db';
import { createGitHubClient, GitHubError, type GitHubClient } from '../lib/github';
import { dueCards, replayCards, uebungStand, type Ereignis } from '../lib/progress';
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
  /** Letzter Versuch je Übungs-ID (für die Ampel) */
  uebungsStand: ReturnType<typeof uebungStand>;
  ereignisse: Ereignis[];
  faellig: string[];
  /** Zeitpunkt, auf den `faellig` und die Ampel-Status gerechnet sind (neu nach jedem Abgleich) */
  jetzt: Date;
  /** Zufallsquelle in [0, 1) (Prüfung mischen); in Tests seedbar */
  zufall: () => number;
  syncStatus: SyncStatus;
  sync(): Promise<void>;
  /** Speichert lokal; hochgeladen wird gebündelt (nach UPLOAD_PAUSE_MS ohne weitere Bewertung, im Hintergrund, am Sitzungsende). */
  record(e: NeuesEreignis): Promise<void>;
  /** Lädt ausstehende Ereignisse sofort hoch (z. B. am Ende einer Sitzung); ohne ausstehende nichts. */
  hochladen(): Promise<void>;
  /** Prüft ein (neues oder das gespeicherte) Token; wirft GitHubError. */
  pruefeVerbindung(token?: string): Promise<void>;
  speichereZugang(z: { token?: string; geraet: string }): Promise<void>;
  /** GitHub-Client mit dem gespeicherten Token (Upload, Rückfragen); null ohne Token. */
  neuerClient(): GitHubClient | null;
  setzeTheme(t: Theme): Promise<void>;
}

export interface AppDataProviderProps {
  children: ReactNode;
  /** Für Tests: eigene DB statt `openLernDb()` */
  db?: LernDatabase;
  /** Für Tests: Fake-Client statt GitHub */
  createClient?: (token: string) => GitHubClient;
  now?: () => Date;
  /** Für Tests: seedbarer Zufall statt Math.random */
  zufall?: () => number;
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

/** IDs aller aktiven (nicht zurückgezogenen) Übungen mit ID. */
export function aktiveUebungIds(topic: Topic): string[] {
  return topic.uebungen.flatMap((u) => (u.id && !u.zurueckgezogen ? [u.id] : []));
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
    try {
      const t = await loadTopic(db, pfad);
      if (t) neu.set(pfad, t);
    } catch {
      // ein unlesbares Thema darf die anderen nicht verhindern
    }
  }
  return neu;
}

/** Leerlauf nach der letzten Bewertung, bevor hochgeladen wird: jeder Upload liest und schreibt die ganze Fortschrittsdatei. */
export const UPLOAD_PAUSE_MS = 60_000;

/** So oft wird `jetzt` bei sichtbarer App neu gelesen, damit fällige Karten auftauchen. */
export const JETZT_TAKT_MS = 5 * 60_000;

const WIEN_UHR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Millisekunden bis zur nächsten Mitternacht in Wien (an Zeitumstellungstagen höchstens eine Stunde daneben; der Takt fängt das auf). */
function msBisWienerMitternacht(d: Date): number {
  const [h = 0, m = 0, s = 0] = WIEN_UHR.format(d).split(':').map(Number);
  const seit = ((h * 60 + m) * 60 + s) * 1000 + d.getMilliseconds();
  return Math.min(Math.max(86_400_000 - seit, 1000), 2 ** 31 - 1);
}

const alsGitHubError = (e: unknown) => (e instanceof GitHubError ? e : new GitHubError('other'));
const ladeEreignisse = async (db: LernDatabase) => (await getAllEvents(db)) as Ereignis[];

export function AppDataProvider({ children, db: dbProp, createClient = createGitHubClient, now = () => new Date(), zufall = Math.random }: AppDataProviderProps) {
  const [bereit, setBereit] = useState(false);
  const [zugang, setZugang] = useState<{ token: string | null; geraet: string | null }>({ token: null, geraet: null });
  const [theme, setTheme] = useState<Theme>('dunkel');
  const [index, setIndex] = useState<LernIndex | null>(null);
  const [themen, setThemen] = useState<Map<string, Topic>>(new Map());
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ laeuft: false, offline: false, stand: null });
  // Zähler, der `jetzt` neu rechnen lässt (Sichtbarkeit, Takt, Mitternacht)
  const [uhrTick, setUhrTick] = useState(0);

  // Refs: sync()/record() lesen immer den aktuellen Stand, auch direkt nach speichereZugang().
  const dbRef = useRef<LernDatabase | null>(null);
  const zugangRef = useRef(zugang);
  const themenRef = useRef(themen);
  const laufenderSync = useRef<Promise<void> | null>(null);
  const fortschrittKette = useRef<Promise<unknown>>(Promise.resolve());
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // Inhalt und Fortschritt unabhängig: scheitert der Inhalt, wird der Fortschritt trotzdem abgeglichen (außer offline).
        let inhalt: Awaited<ReturnType<typeof syncContent>> | null = null;
        let fehler: GitHubError | undefined;
        try {
          inhalt = await syncContent(client, db);
        } catch (e) {
          fehler = alsGitHubError(e);
        }
        let offline = inhalt?.offline ?? fehler?.kind === 'network';
        const neueThemen = inhalt ? await ladeThemen(db, inhalt.index, themenRef.current, inhalt.geaendert) : null;
        if (geraet && !offline) {
          try {
            offline = (await fortschrittAbgleichen(client, db, geraet)).offline;
          } catch (e) {
            fehler ??= alsGitHubError(e);
          }
        }
        const ev = await ladeEreignisse(db);
        if (inhalt && neueThemen) {
          themenRef.current = neueThemen;
          setIndex(inhalt.index);
          setThemen(neueThemen);
        }
        setEreignisse(ev);
        setSyncStatus((s) => ({ laeuft: false, offline: inhalt ? offline : s.offline, stand: inhalt?.stand ?? s.stand, fehler }));
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
      setSyncStatus({ laeuft: false, offline: false, stand: null, fehler: new GitHubError('speicher') });
      setBereit(true);
    });
    return () => {
      abgebrochen = true;
    };
  }, [dbProp, sync]);

  const hochladen = useCallback(async () => {
    if (uploadTimer.current !== null) {
      clearTimeout(uploadTimer.current);
      uploadTimer.current = null;
    }
    const db = dbRef.current;
    const { token, geraet } = zugangRef.current;
    if (!db || !token || !geraet) return;
    try {
      if ((await getOutbox(db)).length === 0) return;
      const r = await fortschrittAbgleichen(createClientRef.current(token), db, geraet);
      setEreignisse(await ladeEreignisse(db));
      setSyncStatus((s) => ({ ...s, offline: r.offline, fehler: undefined }));
    } catch (err) {
      // Fehler landen nur im syncStatus; die Outbox bleibt für den nächsten Versuch
      setSyncStatus((s) => ({ ...s, fehler: alsGitHubError(err) }));
    }
  }, [fortschrittAbgleichen]);

  // Wieder sichtbar → abgleichen; in den Hintergrund → Ausstehendes hochladen (die App kann danach beendet werden).
  // Wieder online → abgleichen.
  useEffect(() => {
    const beiSichtbar = () => {
      if (document.visibilityState === 'visible') void sync();
      else if (document.visibilityState === 'hidden') void hochladen();
    };
    const beiOnline = () => void sync();
    document.addEventListener('visibilitychange', beiSichtbar);
    window.addEventListener('online', beiOnline);
    return () => {
      document.removeEventListener('visibilitychange', beiSichtbar);
      window.removeEventListener('online', beiOnline);
    };
  }, [sync, hochladen]);

  // `jetzt` aktuell halten: beim Sichtbarwerden, alle 5 Minuten (nur sichtbar) und um Mitternacht in Wien.
  useEffect(() => {
    const tick = () => setUhrTick((t) => t + 1);
    let takt: ReturnType<typeof setInterval> | null = null;
    let mitternacht: ReturnType<typeof setTimeout> | null = null;
    const taktStoppen = () => {
      if (takt !== null) clearInterval(takt);
      takt = null;
    };
    const taktStarten = () => {
      taktStoppen();
      if (document.visibilityState !== 'hidden') takt = setInterval(tick, JETZT_TAKT_MS);
    };
    const mitternachtPlanen = () => {
      if (mitternacht !== null) clearTimeout(mitternacht);
      mitternacht = setTimeout(() => {
        tick();
        mitternachtPlanen();
      }, msBisWienerMitternacht(nowRef.current()));
    };
    const beiSichtbarkeit = () => {
      if (document.visibilityState === 'visible') {
        tick();
        mitternachtPlanen(); // Timer können im Hintergrund gedrosselt worden sein
      }
      taktStarten();
    };
    document.addEventListener('visibilitychange', beiSichtbarkeit);
    taktStarten();
    mitternachtPlanen();
    return () => {
      document.removeEventListener('visibilitychange', beiSichtbarkeit);
      taktStoppen();
      if (mitternacht !== null) clearTimeout(mitternacht);
    };
  }, []);

  useEffect(
    () => () => {
      if (uploadTimer.current !== null) clearTimeout(uploadTimer.current);
    },
    [],
  );

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
      // Entprellt: erst nach UPLOAD_PAUSE_MS ohne weitere Bewertung hochladen.
      if (uploadTimer.current !== null) clearTimeout(uploadTimer.current);
      uploadTimer.current = setTimeout(() => void hochladen(), UPLOAD_PAUSE_MS);
    },
    [hochladen],
  );

  const pruefeVerbindung = useCallback(async (token?: string) => {
    const t = token || zugangRef.current.token;
    if (!t) throw new GitHubError('auth');
    await createClientRef.current(t).testAccess();
  }, []);

  const neuerClient = useCallback(() => {
    const t = zugangRef.current.token;
    return t ? createClientRef.current(t) : null;
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
  const uebungsStand = useMemo(() => uebungStand(ereignisse), [ereignisse]);
  // syncStatus: nach jedem Abgleich neu gegen die aktuelle Zeit rechnen
  const jetzt = useMemo(() => nowRef.current(), [kartenZustand, themen, syncStatus, uhrTick]);
  const faellig = useMemo(() => dueCards(kartenZustand, [...themen.values()].flatMap(aktiveKartenIds), jetzt), [kartenZustand, themen, jetzt]);
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
      uebungsStand,
      ereignisse,
      faellig,
      jetzt,
      zufall,
      syncStatus,
      sync,
      record,
      hochladen,
      pruefeVerbindung,
      speichereZugang,
      neuerClient,
      setzeTheme,
    }),
    [bereit, zugang, theme, index, topics, kartenZustand, uebungsStand, ereignisse, faellig, jetzt, zufall, syncStatus, sync, record, hochladen, pruefeVerbindung, speichereZugang, neuerClient, setzeTheme],
  );

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}
