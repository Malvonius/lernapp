import type { Topic } from '../format/types';
import type { Ereignis } from './progress';
import { wienerTag } from './streak';

/** „YYYY-MM-DD“ + n Tage, rein kalendarisch in UTC (Zeitumstellung egal). */
export function tagPlus(tag: string, n: number): string {
  const d = new Date(`${tag}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Wiener Kalendertag eines Ereignisses; null bei ungültiger Zeit. */
function tagVon(e: Ereignis): string | null {
  const t = Date.parse(e.zeit);
  return Number.isNaN(t) ? null : wienerTag(new Date(t));
}

export interface TagesAktivitaet {
  tag: string;
  karten: number;
  uebungen: number;
}

/** Bewertete Karten und Übungen je Wiener Kalendertag, die letzten `tage` Tage bis heute (alle Geräte). */
export function aktivitaetProTag(ereignisse: readonly Ereignis[], tage: number, jetzt: Date): TagesAktivitaet[] {
  const heute = wienerTag(jetzt);
  const liste = Array.from({ length: Math.max(0, tage) }, (_, i) => ({ tag: tagPlus(heute, i - tage + 1), karten: 0, uebungen: 0 }));
  const nachTag = new Map(liste.map((d) => [d.tag, d]));
  for (const e of ereignisse) {
    if (e.art !== 'karte' && e.art !== 'uebung') continue;
    const tag = tagVon(e);
    const d = tag ? nachTag.get(tag) : undefined;
    if (!d) continue;
    if (e.art === 'karte') d.karten++;
    else d.uebungen++;
  }
  return liste;
}

export interface KalenderTag {
  tag: string;
  /** Karten + Übungen an diesem Tag */
  anzahl: number;
  /** Tag liegt nach heute (wird leer gezeichnet) */
  zukunft: boolean;
}

/** Glut-Kalender: `wochen` Wochen Montag–Sonntag, die letzte enthält heute (Wien). */
export function glutKalender(ereignisse: readonly Ereignis[], wochen: number, jetzt: Date): KalenderTag[][] {
  const heute = wienerTag(jetzt);
  const wochentag = (new Date(`${heute}T12:00:00.000Z`).getUTCDay() + 6) % 7; // Mo = 0
  const start = tagPlus(heute, -wochentag - 7 * (Math.max(1, wochen) - 1));
  const zaehler = new Map<string, number>();
  for (const e of ereignisse) {
    if (e.art !== 'karte' && e.art !== 'uebung') continue;
    const tag = tagVon(e);
    if (tag) zaehler.set(tag, (zaehler.get(tag) ?? 0) + 1);
  }
  return Array.from({ length: Math.max(1, wochen) }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const tag = tagPlus(start, w * 7 + d);
      const zukunft = tag > heute;
      return { tag, anzahl: zukunft ? 0 : (zaehler.get(tag) ?? 0), zukunft };
    }),
  );
}

/** Ein Thema mit Fach- und Kapitelnamen für die Statistik. */
export interface StatThema {
  fachId: string;
  fachName: string;
  kapitel: string;
  topic: Topic;
}

export interface Quote {
  treffer: number;
  gesamt: number;
}

export interface KapitelQuote {
  kapitel: string;
  karten: Quote;
  uebungen: Quote;
}

export interface FachQuote {
  fachId: string;
  fachName: string;
  karten: Quote;
  uebungen: Quote;
  kapitel: KapitelQuote[];
}

/** Aktive Karten- und Übungs-IDs → Fach und Kapitel. */
function zuordnung(themen: readonly StatThema[]) {
  const karten = new Map<string, StatThema>();
  const uebungen = new Map<string, StatThema>();
  for (const t of themen) {
    for (const k of t.topic.karten) if (k.id && !k.zurueckgezogen) karten.set(k.id, t);
    for (const u of t.topic.uebungen) if (u.id && !u.zurueckgezogen) uebungen.set(u.id, t);
  }
  return { karten, uebungen };
}

/**
 * Trefferquote je Fach und Kapitel (Reihenfolge wie in `themen`). Karten: Anteil Bewertungen ≠ „Nochmal“;
 * Übungen: Anteil richtig. Gezählt wird jede Bewertung (alle Geräte), nur für aktive Elemente.
 */
export function trefferquote(ereignisse: readonly Ereignis[], themen: readonly StatThema[]): FachQuote[] {
  const faecher = new Map<string, FachQuote>();
  const kapitel = new Map<string, KapitelQuote>();
  const leer = (): Quote => ({ treffer: 0, gesamt: 0 });
  for (const t of themen) {
    if (!faecher.has(t.fachId)) faecher.set(t.fachId, { fachId: t.fachId, fachName: t.fachName, karten: leer(), uebungen: leer(), kapitel: [] });
    const key = JSON.stringify([t.fachId, t.kapitel]);
    if (!kapitel.has(key)) {
      const k = { kapitel: t.kapitel, karten: leer(), uebungen: leer() };
      kapitel.set(key, k);
      faecher.get(t.fachId)!.kapitel.push(k);
    }
  }
  const { karten, uebungen } = zuordnung(themen);
  for (const e of ereignisse) {
    if (e.art === 'pruefung') continue;
    const t = (e.art === 'karte' ? karten : uebungen).get(e.ziel);
    if (!t) continue;
    const treffer = e.art === 'karte' ? e.bewertung !== 1 : e.richtig;
    const f = faecher.get(t.fachId)!;
    const k = kapitel.get(JSON.stringify([t.fachId, t.kapitel]))!;
    for (const q of e.art === 'karte' ? [f.karten, k.karten] : [f.uebungen, k.uebungen]) {
      q.gesamt++;
      if (treffer) q.treffer++;
    }
  }
  return [...faecher.values()];
}

export interface VergesseneKarte {
  id: string;
  frage: string;
  nochmal: number;
  /** Zeit der letzten „Nochmal“-Bewertung */
  zuletzt: string;
  themaId: string;
  themaTitel: string;
  fachId: string;
}

/** Aktive Karten mit den meisten „Nochmal“ (Gleichstand: zuletzt vergessen zuerst), höchstens `n`. */
export function meistVergessen(ereignisse: readonly Ereignis[], themen: readonly StatThema[], n = 10): VergesseneKarte[] {
  const karten = new Map<string, { t: StatThema; frage: string }>();
  for (const t of themen) for (const k of t.topic.karten) if (k.id && !k.zurueckgezogen) karten.set(k.id, { t, frage: k.frage });
  const zaehler = new Map<string, VergesseneKarte>();
  for (const e of ereignisse) {
    if (e.art !== 'karte' || e.bewertung !== 1) continue;
    const k = karten.get(e.ziel);
    if (!k) continue;
    const v = zaehler.get(e.ziel) ?? {
      id: e.ziel,
      frage: k.frage,
      nochmal: 0,
      zuletzt: e.zeit,
      themaId: k.t.topic.id,
      themaTitel: k.t.topic.titel,
      fachId: k.t.fachId,
    };
    v.nochmal++;
    if (e.zeit > v.zuletzt) v.zuletzt = e.zeit;
    zaehler.set(e.ziel, v);
  }
  return [...zaehler.values()]
    .sort((a, b) => b.nochmal - a.nochmal || (a.zuletzt < b.zuletzt ? 1 : a.zuletzt > b.zuletzt ? -1 : 0))
    .slice(0, Math.max(0, n));
}

export interface PruefungsEintrag {
  zeit: string;
  ziel: string;
  /** `probe` = Probe-Schularbeit (ziel `probe:<id>`), sonst Prüfungsmodus */
  art: 'probe' | 'pruefung';
  punkte: number;
  max: number;
  /** 0–100, zwei Nachkommastellen */
  prozent: number;
}

/** Alle Prüfungen und Proben in Zeitreihenfolge. */
export function pruefungsVerlauf(ereignisse: readonly Ereignis[]): PruefungsEintrag[] {
  return ereignisse
    .flatMap((e): PruefungsEintrag[] =>
      e.art === 'pruefung'
        ? [{
            zeit: e.zeit,
            ziel: e.ziel,
            art: e.ziel.startsWith('probe:') ? 'probe' : 'pruefung',
            punkte: e.punkte,
            max: e.max,
            prozent: e.max > 0 ? Math.round((e.punkte * 10_000) / e.max) / 100 : 0,
          }]
        : [],
    )
    .sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0));
}
