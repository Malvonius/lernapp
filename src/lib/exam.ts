import type { Topic } from '../format/types';

export interface Aufgabe {
  art: 'karte' | 'uebung';
  themaId: string;
  kapitel: string;
  id: string;
}

export interface PruefungsThema {
  fach: string;
  kapitel: string;
  topic: Topic;
}

export interface KapitelErgebnis {
  kapitel: string;
  punkte: number;
  max: number;
}

export interface Auswertung {
  punkte: number;
  max: number;
  kapitel: KapitelErgebnis[];
}

function mische<T>(liste: T[], rng: () => number): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface Pool {
  uebungen: Aufgabe[];
  karten: Aufgabe[];
}

/**
 * Wählt bis zu `anzahl` Aufgaben aus den aktiven Karten und Übungen (mit ID) der Themen.
 * Kapitel werden gleichmäßig bedient, Übungen bevorzugt (mindestens die Hälfte, wenn genug da sind),
 * ohne Duplikate. Die Reihenfolge ist gemischt.
 */
export function bauePruefung(themen: PruefungsThema[], anzahl: number, rng: () => number): Aufgabe[] {
  const pools = new Map<string, Pool>();
  const gesehen = new Set<string>();
  for (const { kapitel, topic } of themen) {
    const pool = pools.get(kapitel) ?? { uebungen: [], karten: [] };
    pools.set(kapitel, pool);
    for (const u of topic.uebungen) {
      if (!u.id || u.zurueckgezogen || gesehen.has(u.id)) continue;
      gesehen.add(u.id);
      pool.uebungen.push({ art: 'uebung', themaId: topic.id, kapitel, id: u.id });
    }
    for (const k of topic.karten) {
      if (!k.id || k.zurueckgezogen || gesehen.has(k.id)) continue;
      gesehen.add(k.id);
      pool.karten.push({ art: 'karte', themaId: topic.id, kapitel, id: k.id });
    }
  }
  for (const p of pools.values()) {
    p.uebungen = mische(p.uebungen, rng);
    p.karten = mische(p.karten, rng);
  }

  const namen = mische([...pools.keys()], rng);
  const groesse = (n: string) => pools.get(n)!.uebungen.length + pools.get(n)!.karten.length;
  const verfuegbar = namen.reduce((s, n) => s + groesse(n), 0);
  const gesamt = Math.max(0, Math.min(Math.floor(anzahl), verfuegbar));

  // Reihum verteilen: gleichmäßig, begrenzt durch den Vorrat je Kapitel.
  const quote = new Map<string, number>(namen.map((n) => [n, 0]));
  let rest = gesamt;
  while (rest > 0) {
    for (const n of namen) {
      if (rest > 0 && quote.get(n)! < groesse(n)) {
        quote.set(n, quote.get(n)! + 1);
        rest--;
      }
    }
  }

  const ue = new Map<string, Aufgabe[]>();
  const ka = new Map<string, Aufgabe[]>();
  for (const n of namen) {
    const p = pools.get(n)!;
    const q = quote.get(n)!;
    const nUe = Math.min(p.uebungen.length, Math.max(Math.ceil(q / 2), q - p.karten.length));
    ue.set(n, p.uebungen.slice(0, nUe));
    ka.set(n, p.karten.slice(0, q - nUe));
  }

  // Insgesamt mindestens die Hälfte Übungen: Karten gegen ungenutzte Übungen tauschen.
  const alleUe = namen.reduce((s, n) => s + pools.get(n)!.uebungen.length, 0);
  const ziel = Math.min(alleUe, Math.ceil(gesamt / 2));
  let gewaehlt = namen.reduce((s, n) => s + ue.get(n)!.length, 0);
  for (const n of namen) {
    const p = pools.get(n)!;
    while (gewaehlt < ziel && ka.get(n)!.length > 0 && ue.get(n)!.length < p.uebungen.length) {
      ka.get(n)!.pop();
      ue.get(n)!.push(p.uebungen[ue.get(n)!.length]!);
      gewaehlt++;
    }
  }

  return mische(
    namen.flatMap((n) => [...ue.get(n)!, ...ka.get(n)!]),
    rng,
  );
}

/** Punkte gesamt und je Kapitel (Reihenfolge des ersten Auftretens). Fehlende Ergebnisse zählen als falsch. */
export function werteAus(aufgaben: Aufgabe[], ergebnisse: Map<string, boolean>): Auswertung {
  const proKapitel = new Map<string, KapitelErgebnis>();
  let punkte = 0;
  for (const a of aufgaben) {
    const k = proKapitel.get(a.kapitel) ?? { kapitel: a.kapitel, punkte: 0, max: 0 };
    proKapitel.set(a.kapitel, k);
    k.max++;
    if (ergebnisse.get(a.id) === true) {
      k.punkte++;
      punkte++;
    }
  }
  return { punkte, max: aufgaben.length, kapitel: [...proKapitel.values()] };
}
