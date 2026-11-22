import type { Card as FsrsCard } from 'ts-fsrs';
import type { IndexSubject, IndexTopic } from '../format/types';
import { abrufwahrscheinlichkeit } from './progress';

export type Status = 'luecke' | 'fehlerhaft' | 'neu' | 'rot' | 'gelb' | 'gruen';

/** Alle Status in fester Reihenfolge (Anzeige, Zählung). */
export const STATUS_REIHE: Status[] = ['gruen', 'gelb', 'rot', 'neu', 'fehlerhaft', 'luecke'];

/** Anteil der Karten, der mindestens so wahrscheinlich abrufbar ist, zählt als „abrufbar“. */
const ABRUFBAR = 0.9;

export function themaStatus(t: IndexTopic, kartenIds: string[], zustand: Map<string, FsrsCard>, jetzt: Date): Status {
  if (t.pfad === null) return 'luecke';
  if (t.fehler.length > 0) return 'fehlerhaft';
  if (!kartenIds.some((id) => zustand.has(id))) return 'neu';
  const abrufbar = kartenIds.filter((id) => {
    const k = zustand.get(id);
    return k !== undefined && abrufwahrscheinlichkeit(k, jetzt) >= ABRUFBAR;
  }).length;
  const anteil = abrufbar / kartenIds.length;
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
export function fachStatus(fach: IndexSubject, kartenIds: KartenIds, zustand: Map<string, FsrsCard>, jetzt: Date): Status[] {
  return [...fach.kapitel.flatMap((k) => k.themen), ...fach.nichtZugeordnet].map((t) =>
    themaStatus(t, t.pfad === null ? [] : kartenIds(t.pfad), zustand, jetzt),
  );
}
