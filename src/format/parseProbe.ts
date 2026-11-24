import { sections } from './markdown';
import { leseKopf, leseQuellen, parseExercises, pruefePflicht, str } from './parseTopic';
import type { NotenStufe, Probe } from './types';

const REQUIRED_FIELDS = ['id', 'fach', 'titel', 'dauer_min', 'quellen', 'stand'] as const;

/** Liest eine Probe-Schularbeit (`<Fach>/_proben/<Datei>.md`). Wirft nie; Probleme landen in `fehler`. */
export function parseProbe(text: string): Probe {
  const fehler: string[] = [];
  const { data, body, bodyStartLine } = leseKopf(text, fehler);
  pruefePflicht(data, REQUIRED_FIELDS, fehler);
  const quellen = leseQuellen(data, fehler);

  const dauer = data.dauer_min;
  const dauerMin = typeof dauer === 'number' && Number.isFinite(dauer) && dauer > 0 ? dauer : 0;
  if (dauer !== undefined && dauer !== null && dauer !== '' && dauerMin === 0) fehler.push('dauer_min muss eine Zahl > 0 sein');

  const notenschluessel = data.notenschluessel === undefined || data.notenschluessel === null ? null : leseSchluessel(data.notenschluessel, fehler);

  const secs = sections(body, bodyStartLine);
  const aufgabenSec = secs.get('Aufgaben');
  const aufgaben = aufgabenSec ? parseExercises(aufgabenSec, fehler) : [];
  for (const a of aufgaben) if (a.punkte === undefined && !a.zurueckgezogen) fehler.push(`Übung Zeile ${a.zeile}: punkte fehlt`);
  if (!aufgaben.some((a) => !a.zurueckgezogen) && !fehler.some((f) => f.startsWith('Übung'))) fehler.push('Keine Aufgaben (Abschnitt „## Aufgaben“ mit ```uebung-Blöcken)');

  return {
    id: str(data.id),
    fach: str(data.fach),
    titel: str(data.titel),
    dauerMin,
    quellen,
    stand: str(data.stand),
    notenschluessel,
    hinweise: secs.get('Hinweise')?.text ?? '',
    aufgaben,
    fehler,
  };
}

/** Notenschlüssel: Noten 1–5 aufsteigend, `ab_prozent` 0–100 streng absteigend. Ungültig → Fehler und null. */
function leseSchluessel(raw: unknown, fehler: string[]): NotenStufe[] | null {
  const ungueltig = (grund: string) => {
    fehler.push(`Notenschlüssel ungültig: ${grund}`);
    return null;
  };
  if (!Array.isArray(raw) || raw.length === 0) return ungueltig('muss eine Liste von { note, ab_prozent } sein');
  const stufen: NotenStufe[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return ungueltig('muss eine Liste von { note, ab_prozent } sein');
    const { note, ab_prozent: ab } = e as Record<string, unknown>;
    if (typeof note !== 'number' || !Number.isInteger(note) || note < 1 || note > 5) return ungueltig('note muss 1 bis 5 sein');
    if (typeof ab !== 'number' || !Number.isFinite(ab) || ab < 0 || ab > 100) return ungueltig('ab_prozent muss zwischen 0 und 100 liegen');
    stufen.push({ note, abProzent: ab });
  }
  for (let i = 1; i < stufen.length; i++) {
    if (stufen[i]!.abProzent >= stufen[i - 1]!.abProzent || stufen[i]!.note <= stufen[i - 1]!.note) {
      return ungueltig('Prozent müssen absteigend, Noten aufsteigend sein (1 ab 88, 2 ab 75 …)');
    }
  }
  return stufen;
}
