import { GitHubError, type GitHubClient } from './github';
import { addEvents, addEventWithOutbox, clearOutbox, eventKey, getMeta, getOutbox, setMeta, type LernDatabase, type StoredEvent } from './db';
import { mergeEvents, type Ereignis, type FortschrittsDatei } from './progress';

const DIR = '_fortschritt';
const MAX_VERSUCHE = 3;
/** meta-Key: ETag je Datei in _fortschritt/ (Dateiname → ETag), damit unveränderte Dateien nicht neu geladen werden */
const ETAGS = 'fortschrittEtags';

export function normalizeGeraet(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!n) throw new Error('Gerätename darf nicht leer sein.');
  return n;
}

/** zeit muss exakt dem Format von Date#toISOString entsprechen (einheitlich für Dedupe und Sortierung). */
function zeitGueltig(zeit: unknown): boolean {
  if (typeof zeit !== 'string') return false;
  const d = new Date(zeit);
  return !Number.isNaN(d.getTime()) && d.toISOString() === zeit;
}

const istZahl = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

const istEreignis = (x: unknown): x is Ereignis => {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  if (typeof e.ziel !== 'string' || typeof e.geraet !== 'string' || !zeitGueltig(e.zeit)) return false;
  switch (e.art) {
    case 'karte': return e.bewertung === 1 || e.bewertung === 2 || e.bewertung === 3 || e.bewertung === 4;
    case 'uebung': return typeof e.richtig === 'boolean';
    case 'pruefung': return istZahl(e.punkte) && istZahl(e.max);
    default: return false;
  }
};

/** Liest eine Fortschrittsdatei; null, wenn sie kein gültiges Version-1-JSON ist. */
function parseDatei(text: string): Ereignis[] | null {
  try {
    const j = JSON.parse(text) as Partial<FortschrittsDatei> | null;
    if (!j || j.version !== 1 || !Array.isArray(j.ereignisse)) return null;
    return j.ereignisse.filter(istEreignis);
  } catch {
    return null;
  }
}

export async function recordEvent(db: LernDatabase, e: Ereignis): Promise<void> {
  if (!zeitGueltig(e.zeit)) throw new Error('Ungültige Zeit: erwartet new Date().toISOString().');
  await addEventWithOutbox(db, e);
}

export async function syncProgress(
  client: GitHubClient,
  db: LernDatabase,
  geraet: string,
): Promise<{ hochgeladen: number; offline: boolean }> {
  const name = normalizeGeraet(geraet);
  const eigenerName = `${name}.json`;
  const pfad = `${DIR}/${eigenerName}`;
  try {
    const alteEtags = ((await getMeta(db, ETAGS)) ?? {}) as Record<string, string>;
    const etags: Record<string, string> = {};
    /** Liest eine Datei nur, wenn sie sich seit dem letzten Mal geändert hat (If-None-Match, 304 zählt nicht ins Limit). */
    const lesenWennGeaendert = async (datei: string): Promise<{ text: string } | 'unchanged' | null> => {
      let r;
      try {
        r = await client.getRaw(`${DIR}/${datei}`, alteEtags[datei]);
      } catch (err) {
        if (err instanceof GitHubError && err.kind === 'notfound') return null; // inzwischen gelöscht
        throw err;
      }
      if (r === 'unchanged') {
        etags[datei] = alteEtags[datei]!;
        return 'unchanged';
      }
      if (r.etag) etags[datei] = r.etag;
      return r;
    };

    // 1. Fremde Geräte: Ereignisse nach events mergen (kaputte Dateien ignorieren, nie anfassen).
    const dateien = await client.listDir(DIR);
    for (const datei of dateien) {
      if (!datei.endsWith('.json') || datei === eigenerName) continue;
      const f = await lesenWennGeaendert(datei);
      if (f === null || f === 'unchanged') continue;
      const ereignisse = parseDatei(f.text);
      if (ereignisse?.length) await addEvents(db, ereignisse as StoredEvent[]);
    }

    // Nichts hochzuladen: eigene Datei nur lesen (z. B. Ereignisse einer früheren Installation), kein sha nötig.
    if ((await getOutbox(db)).length === 0) {
      if (dateien.includes(eigenerName)) {
        const f = await lesenWennGeaendert(eigenerName);
        if (f !== null && f !== 'unchanged') {
          const gelesen = parseDatei(f.text);
          if (!gelesen) {
            delete etags[eigenerName];
            await setMeta(db, ETAGS, etags);
            throw new GitHubError('beschaedigt');
          }
          await addEvents(db, gelesen as StoredEvent[]);
        }
      }
      await setMeta(db, ETAGS, etags);
      return { hochgeladen: 0, offline: false };
    }
    await setMeta(db, ETAGS, etags); // fremde sind verarbeitet; die eigene Datei ändert sich gleich (ETag dann neu)

    // 2./3. Eigene Datei: Outbox anhängen, bei Konflikt neu laden (höchstens 3 Versuche).
    for (let versuch = 1; ; versuch++) {
      const datei = await client.getFile(pfad);
      let vorhanden: Ereignis[] = [];
      if (datei) {
        const gelesen = parseDatei(datei.text);
        if (!gelesen) throw new GitHubError('beschaedigt'); // nie überschreiben
        vorhanden = gelesen;
        await addEvents(db, vorhanden as StoredEvent[]);
      }
      const outbox = await getOutbox(db);
      const bekannt = new Set(vorhanden.map((e) => JSON.stringify(eventKey(e as StoredEvent))));
      const neu = outbox.filter((e) => !bekannt.has(JSON.stringify(eventKey(e)))).length;
      if (neu > 0) {
        const inhalt: FortschrittsDatei = { version: 1, geraet: name, ereignisse: mergeEvents(vorhanden, outbox as Ereignis[]) };
        try {
          // kompakt: die Datei wächst mit jeder Bewertung, Einrückung würde sie gut doppelt so groß machen
          await client.putFile(pfad, JSON.stringify(inhalt), datei?.sha ?? null, `fortschritt: ${name}`);
        } catch (err) {
          if (err instanceof GitHubError && err.kind === 'conflict' && versuch < MAX_VERSUCHE) continue;
          throw err;
        }
      }
      // 4. Erfolg: genau die gelesenen Outbox-Einträge entfernen.
      await clearOutbox(db, outbox.map(eventKey));
      return { hochgeladen: neu, offline: false };
    }
  } catch (err) {
    if (err instanceof GitHubError && err.kind === 'network') return { hochgeladen: 0, offline: true };
    throw err;
  }
}
