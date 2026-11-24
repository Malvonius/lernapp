import type { Exercise, NotenStufe } from '../format/types';
import type { Ereignis } from './progress';

/** Selbsteinschätzung bei `schritte`/`offen`: volle, halbe (auf 0,5 gerundet) oder keine Punkte. */
export type Stufe = 'voll' | 'teilweise' | 'keine';

/** Antwort auf eine Aufgabe: `eingabe`/`mc` prüft die App, `schritte`/`offen` schätzt man selbst ein. */
export type Antwort = { art: 'auto'; richtig: boolean } | { art: 'selbst'; stufe: Stufe };

export interface AufgabenErgebnis {
  /** Position der Aufgabe in der Probe-Datei */
  nr: number;
  punkte: number;
  max: number;
  /** `offen` = nicht beantwortet (zählt 0) */
  stufe: Stufe | 'offen';
}

export interface ProbeAuswertung {
  punkte: number;
  max: number;
  /** 0–100, ungerundet (Note vergleicht genau; gerundet wird nur in der Anzeige) */
  prozent: number;
  aufgaben: AufgabenErgebnis[];
}

/** Halbe Punkte, auf 0,5 gerundet (5 → 2,5; 1,5 → 1). */
export function teilPunkte(max: number): number {
  return Math.round(max) / 2;
}

/** Punkte je Aufgabe und gesamt. Zurückgezogene Aufgaben zählen nicht; unbeantwortete zählen 0. */
export function bewerte(aufgaben: readonly Exercise[], antworten: ReadonlyMap<number, Antwort>): ProbeAuswertung {
  const ergebnisse: AufgabenErgebnis[] = [];
  aufgaben.forEach((a, nr) => {
    if (a.zurueckgezogen) return;
    const max = a.punkte ?? 0;
    const antwort = antworten.get(nr);
    const stufe: AufgabenErgebnis['stufe'] = !antwort ? 'offen' : antwort.art === 'auto' ? (antwort.richtig ? 'voll' : 'keine') : antwort.stufe;
    const punkte = stufe === 'voll' ? max : stufe === 'teilweise' ? teilPunkte(max) : 0;
    ergebnisse.push({ nr, punkte, max, stufe });
  });
  const punkte = ergebnisse.reduce((s, e) => s + e.punkte, 0);
  const max = ergebnisse.reduce((s, e) => s + e.max, 0);
  // erst mal 100, dann teilen: 22 von 25 ergibt genau 88
  const prozent = max === 0 ? 0 : (punkte * 100) / max;
  return { punkte, max, prozent, aufgaben: ergebnisse };
}

/**
 * Note zum Prozentwert: die erste Stufe, deren Schwelle erreicht ist (genau auf der Schwelle zählt).
 * Unter der niedrigsten Schwelle: 5. Ohne Schlüssel: null (die App zeigt dann keine Note).
 */
export function note(prozent: number, schluessel: readonly NotenStufe[] | null): number | null {
  if (!schluessel) return null;
  const stufe = [...schluessel].sort((a, b) => b.abProzent - a.abProzent).find((s) => prozent >= s.abProzent);
  return stufe ? stufe.note : 5;
}

/** „63,3 %“: eine Nachkommastelle, abgerundet (zeigt nie eine erreichte Grenze, die nicht erreicht ist). */
export function formatProzent(prozent: number): string {
  const z = Math.floor(prozent * 10 + 1e-9) / 10;
  return `${String(z).replace('.', ',')} %`;
}

/** Punktzahl deutsch: „9,5“ */
export function formatPunkte(p: number): string {
  return String(p).replace('.', ',');
}

/** Ziel der `pruefung`-Ereignisse einer Probe */
export const probeZiel = (id: string) => `probe:${id}`;

/** Jüngstes Ergebnis einer Probe (alle Geräte); null, wenn sie noch nie abgegeben wurde. */
export function letztesErgebnis(ereignisse: readonly Ereignis[], probeId: string): { punkte: number; max: number; zeit: string } | null {
  const ziel = probeZiel(probeId);
  let best: { punkte: number; max: number; zeit: string } | null = null;
  for (const e of ereignisse) {
    if (e.art !== 'pruefung' || e.ziel !== ziel) continue;
    if (!best || e.zeit > best.zeit) best = { punkte: e.punkte, max: e.max, zeit: e.zeit };
  }
  return best;
}
