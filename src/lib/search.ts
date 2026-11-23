import type { Topic } from '../format/types';

export interface Treffer {
  pfad: string;
  titel: string;
  fachName: string;
  wo: 'titel' | 'text' | 'karte';
  ausschnitt: string;
}

export const MAX_TREFFER = 50;
const AUSSCHNITT_LAENGE = 120;
const VORLAUF = 40;

/** Kleinschreibung, ä→ae, ö→oe, ü→ue, ß→ss, übrige Akzente weg. */
export function normalisiere(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const woerter = (q: string) => normalisiere(q).split(/\s+/).filter(Boolean);

/** Normalisierter Text samt Zuordnung jeder Position zurück in den Originaltext. */
function mitKarte(text: string) {
  let norm = '';
  const von: number[] = [];
  const bis: number[] = [];
  let i = 0;
  for (const zeichen of text) {
    const n = normalisiere(zeichen);
    for (let k = 0; k < n.length; k++) {
      von.push(i);
      bis.push(i + zeichen.length);
    }
    norm += n;
    i += zeichen.length;
  }
  return { norm, von, bis };
}

/** Alle Fundstellen der Suchwörter im Originaltext als [start, ende), sortiert und zusammengefasst. */
export function bereiche(text: string, q: string): [number, number][] {
  const ws = woerter(q);
  if (ws.length === 0) return [];
  const { norm, von, bis } = mitKarte(text);
  const roh: [number, number][] = [];
  for (const w of ws) {
    for (let p = norm.indexOf(w); p !== -1; p = norm.indexOf(w, p + 1)) {
      roh.push([von[p]!, bis[p + w.length - 1]!]);
    }
  }
  roh.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const aus: [number, number][] = [];
  for (const r of roh) {
    const letzter = aus[aus.length - 1];
    if (letzter && r[0] <= letzter[1]) letzter[1] = Math.max(letzter[1], r[1]);
    else aus.push([r[0], r[1]]);
  }
  return aus;
}

const enthaeltAlle = (text: string, ws: string[]) => {
  const n = normalisiere(text);
  return ws.every((w) => n.includes(w));
};

function ausschnittAus(roh: string, q: string): string {
  const text = roh.replace(/\s+/g, ' ').trim();
  const erster = bereiche(text, q)[0];
  if (!erster || text.length <= AUSSCHNITT_LAENGE) return text;
  const start = Math.min(Math.max(0, erster[0] - VORLAUF), text.length - AUSSCHNITT_LAENGE);
  const ende = start + AUSSCHNITT_LAENGE;
  return `${start > 0 ? '…' : ''}${text.slice(start, ende).trim()}${ende < text.length ? '…' : ''}`;
}

/**
 * Volltextsuche über Titel, Zusammenfassung und Karten (ohne zurückgezogene).
 * Mehrere Wörter: alle müssen vorkommen. Reihenfolge: Titel, Text, Karten; je Gruppe in Eingabereihenfolge.
 */
export function suche(themen: { pfad: string; topic: Topic; fachName: string }[], q: string): Treffer[] {
  const ws = woerter(q);
  if (ws.length === 0) return [];
  const gruppen: Record<Treffer['wo'], Treffer[]> = { titel: [], text: [], karte: [] };
  for (const { pfad, topic, fachName } of themen) {
    const basis = { pfad, titel: topic.titel, fachName };
    if (enthaeltAlle(topic.titel, ws)) gruppen.titel.push({ ...basis, wo: 'titel', ausschnitt: topic.titel });
    if (enthaeltAlle(topic.zusammenfassung, ws)) {
      gruppen.text.push({ ...basis, wo: 'text', ausschnitt: ausschnittAus(topic.zusammenfassung, q) });
    }
    for (const k of topic.karten) {
      if (k.zurueckgezogen) continue;
      const volltext = `${k.frage} ${k.antwort}`;
      if (enthaeltAlle(volltext, ws)) gruppen.karte.push({ ...basis, wo: 'karte', ausschnitt: ausschnittAus(volltext, q) });
    }
  }
  return [...gruppen.titel, ...gruppen.text, ...gruppen.karte].slice(0, MAX_TREFFER);
}
