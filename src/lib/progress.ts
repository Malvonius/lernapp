import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs';

export type Bewertung = 1 | 2 | 3 | 4; // Nochmal, Schwer, Gut, Einfach
export type Ereignis =
  | { art: 'karte'; ziel: string; zeit: string; geraet: string; bewertung: Bewertung }
  | { art: 'uebung'; ziel: string; zeit: string; geraet: string; richtig: boolean }
  | { art: 'pruefung'; ziel: string; zeit: string; geraet: string; punkte: number; max: number };
export interface FortschrittsDatei { version: 1; geraet: string; ereignisse: Ereignis[] }

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const ordnung = (a: Ereignis, b: Ereignis) =>
  cmp(a.zeit, b.zeit) || cmp(a.geraet, b.geraet) || cmp(a.art, b.art) || cmp(a.ziel, b.ziel);
const schluessel = (e: Ereignis) => JSON.stringify([e.geraet, e.zeit, e.art, e.ziel]);

/** Vereinigt Ereignislisten: Duplikate über (geraet, zeit, art, ziel) fallen weg, die Ausgabe ist total sortiert. */
export function mergeEvents(...listen: Ereignis[][]): Ereignis[] {
  const alle = new Map<string, Ereignis>();
  for (const liste of listen) for (const e of liste) if (!alle.has(schluessel(e))) alle.set(schluessel(e), e);
  return [...alle.values()].sort(ordnung);
}

// enable_fuzz: false, damit jedes Gerät dasselbe Ergebnis berechnet.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

/** Abrufwahrscheinlichkeit (0..1) einer Karte zum Zeitpunkt `jetzt`, mit demselben Scheduler wie replayCards. */
export function abrufwahrscheinlichkeit(karte: FsrsCard, jetzt: Date): number {
  return scheduler.retrievability(karte, jetzt);
}

/** Spielt alle Kartenbewertungen in Zeitreihenfolge ab und liefert den FSRS-Zustand je Karte. */
export function replayCards(ereignisse: Ereignis[]): Map<string, FsrsCard> {
  const zustand = new Map<string, FsrsCard>();
  for (const e of [...ereignisse].sort(ordnung)) {
    if (e.art !== 'karte') continue;
    const zeit = new Date(e.zeit);
    const karte = zustand.get(e.ziel) ?? createEmptyCard(zeit);
    zustand.set(e.ziel, scheduler.next(karte, zeit, e.bewertung as Grade).card);
  }
  return zustand;
}

/** IDs, die jetzt fällig sind; Karten ohne Ereignis gelten als neu und damit fällig. */
export function dueCards(zustand: Map<string, FsrsCard>, alleKartenIds: string[], jetzt: Date): string[] {
  return alleKartenIds.filter((id) => {
    const k = zustand.get(id);
    return !k || k.due.getTime() <= jetzt.getTime();
  });
}

/** Nächste Fälligkeit je Bewertung (1–4) für eine Karte; `undefined` = neue Karte. Gleicher Scheduler wie replayCards. */
export function vorschau(karte: FsrsCard | undefined, jetzt: Date): Record<Bewertung, Date> {
  // Liegt die letzte Wiederholung nach `jetzt` (Uhr/Sync hinkt), ab dort rechnen statt mit negativer Zeitspanne.
  const t = karte?.last_review && karte.last_review.getTime() > jetzt.getTime() ? karte.last_review : jetzt;
  const log = scheduler.repeat(karte ?? createEmptyCard(t), t);
  return { 1: log[Rating.Again].card.due, 2: log[Rating.Hard].card.due, 3: log[Rating.Good].card.due, 4: log[Rating.Easy].card.due };
}

/** Kurzform eines Intervalls auf Deutsch: „1 Min“, „3 Std“, „4 Tage“, „2 Mon“, „1 Jahr“. */
export function formatIntervall(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(min, 1)} Min`;
  const std = Math.round(ms / 3_600_000);
  if (std < 24) return `${std} Std`;
  const tage = Math.round(ms / 86_400_000);
  if (tage < 30) return `${tage} ${tage === 1 ? 'Tag' : 'Tage'}`;
  if (tage < 365) return `${Math.round(tage / 30)} Mon`;
  const jahre = Math.round(tage / 365);
  return `${jahre} ${jahre === 1 ? 'Jahr' : 'Jahre'}`;
}

export function uebungStand(ereignisse: Ereignis[]): Map<string, { versuche: number; zuletztRichtig: boolean }> {
  const stand = new Map<string, { versuche: number; zuletztRichtig: boolean }>();
  for (const e of [...ereignisse].sort(ordnung)) {
    if (e.art !== 'uebung') continue;
    stand.set(e.ziel, { versuche: (stand.get(e.ziel)?.versuche ?? 0) + 1, zuletztRichtig: e.richtig });
  }
  return stand;
}
