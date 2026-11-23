import type { Card as FsrsCard } from 'ts-fsrs';
import type { IndexSubject, IndexTopic } from '../format/types';
import { abrufwahrscheinlichkeit } from './progress';

export type Status = 'luecke' | 'fehlerhaft' | 'neu' | 'rot' | 'gelb' | 'gruen';

/** Alle Status in fester Reihenfolge (Anzeige, Zählung). */
export const STATUS_REIHE: Status[] = ['gruen', 'gelb', 'rot', 'neu', 'fehlerhaft', 'luecke'];

/** Anteil der Karten, der mindestens so wahrscheinlich abrufbar ist, zählt als „abrufbar“. */
const ABRUFBAR = 0.9;

/** Übungen eines Themas: aktive IDs und der letzte Versuch je Übung (aus `uebungStand`). */
export interface UebungsDaten {
  ids: string[];
  stand: Map<string, { zuletztRichtig: boolean }>;
}

/**
 * Ampel eines Themas. Gesamtwert = Mittel aus Karten-Abrufquote und Übungsquote (zuletzt richtig / alle aktiven Übungen),
 * soweit das Thema Karten bzw. Übungen hat; nie Bewertetes und nie Versuchtes zählt als 0.
 */
export function themaStatus(t: IndexTopic, kartenIds: string[], zustand: Map<string, FsrsCard>, jetzt: Date, uebungen?: UebungsDaten): Status {
  if (t.pfad === null) return 'luecke';
  if (t.fehler.length > 0) return 'fehlerhaft';
  const uebIds = uebungen?.ids ?? [];
  const versucht = uebIds.filter((id) => uebungen!.stand.has(id));
  if (!kartenIds.some((id) => zustand.has(id)) && versucht.length === 0) return 'neu';
  const quoten: number[] = [];
  if (kartenIds.length > 0) {
    const abrufbar = kartenIds.filter((id) => {
      const k = zustand.get(id);
      return k !== undefined && abrufwahrscheinlichkeit(k, jetzt) >= ABRUFBAR;
    }).length;
    quoten.push(abrufbar / kartenIds.length);
  }
  if (uebIds.length > 0) quoten.push(versucht.filter((id) => uebungen!.stand.get(id)!.zuletztRichtig).length / uebIds.length);
  const anteil = quoten.reduce((a, b) => a + b, 0) / quoten.length;
  return anteil >= 0.8 ? 'gruen' : anteil >= 0.5 ? 'gelb' : 'rot';
}

// Schlechtester zuerst: „neu“ (noch nichts gelernt) zählt schlechter als „gelb“.
const SCHLECHT: Status[] = ['rot', 'neu', 'gelb', 'gruen'];

/** Das schlechteste Thema-Ergebnis; Lücken und fehlerhafte zählen nur, wenn es nichts anderes gibt. */
export function kapitelStatus(themen: Status[]): Status {
  const echte = SCHLECHT.find((s) => themen.includes(s));
  if (echte) return echte;
  return themen.includes('fehlerhaft') ? 'fehlerhaft' : 'luecke';
}

/** IDs der aktiven Karten eines Themas; `topicKarten(pfad)` liefert sie (leer, wenn nicht geladen). */
export type KartenIds = (pfad: string) => string[];

/** Status jedes Themas eines Fachs (Kapitel und nicht zugeordnete), für Start-Kachel und Fachansicht. */
export function fachStatus(
  fach: IndexSubject,
  kartenIds: KartenIds,
  zustand: Map<string, FsrsCard>,
  jetzt: Date,
  uebungen?: { ids: KartenIds; stand: UebungsDaten['stand'] },
): Status[] {
  return [...fach.kapitel.flatMap((k) => k.themen), ...fach.nichtZugeordnet].map((t) =>
    themaStatus(
      t,
      t.pfad === null ? [] : kartenIds(t.pfad),
      zustand,
      jetzt,
      uebungen && t.pfad !== null ? { ids: uebungen.ids(t.pfad), stand: uebungen.stand } : undefined,
    ),
  );
}
