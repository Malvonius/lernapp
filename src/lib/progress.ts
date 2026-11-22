import { createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type Grade } from 'ts-fsrs';

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

export function uebungStand(ereignisse: Ereignis[]): Map<string, { versuche: number; zuletztRichtig: boolean }> {
  const stand = new Map<string, { versuche: number; zuletztRichtig: boolean }>();
  for (const e of [...ereignisse].sort(ordnung)) {
    if (e.art !== 'uebung') continue;
    stand.set(e.ziel, { versuche: (stand.get(e.ziel)?.versuche ?? 0) + 1, zuletztRichtig: e.richtig });
  }
  return stand;
}
