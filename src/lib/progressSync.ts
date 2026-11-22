import { GitHubError, type GitHubClient } from './github';
import { addEvents, addEventWithOutbox, clearOutbox, eventKey, getOutbox, type LernDatabase, type StoredEvent } from './db';
import { mergeEvents, type Ereignis, type FortschrittsDatei } from './progress';

const DIR = '_fortschritt';
const MAX_VERSUCHE = 3;

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
    // 1. Fremde Geräte: Ereignisse nach events mergen (kaputte Dateien ignorieren, nie anfassen).
    for (const datei of await client.listDir(DIR)) {
      if (!datei.endsWith('.json') || datei === eigenerName) continue;
      const f = await client.getFile(`${DIR}/${datei}`);
      const ereignisse = f ? parseDatei(f.text) : null;
      if (ereignisse?.length) await addEvents(db, ereignisse as StoredEvent[]);
    }

    // 2./3. Eigene Datei: Outbox anhängen, bei Konflikt neu laden (höchstens 3 Versuche).
    for (let versuch = 1; ; versuch++) {
      const datei = await client.getFile(pfad);
      let vorhanden: Ereignis[] = [];
      if (datei) {
        const gelesen = parseDatei(datei.text);
        if (!gelesen) throw new GitHubError('other'); // nie überschreiben
        vorhanden = gelesen;
        await addEvents(db, vorhanden as StoredEvent[]);
      }
      const outbox = await getOutbox(db);
      const bekannt = new Set(vorhanden.map((e) => JSON.stringify(eventKey(e as StoredEvent))));
      const neu = outbox.filter((e) => !bekannt.has(JSON.stringify(eventKey(e)))).length;
      if (neu > 0) {
        const inhalt: FortschrittsDatei = { version: 1, geraet: name, ereignisse: mergeEvents(vorhanden, outbox as Ereignis[]) };
        try {
          await client.putFile(pfad, JSON.stringify(inhalt, null, 2) + '\n', datei?.sha ?? null, `fortschritt: ${name}`);
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
