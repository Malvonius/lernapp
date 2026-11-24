import { describe, expect, it } from 'vitest';
import type { Topic } from '../../src/format/types';
import type { Ereignis } from '../../src/lib/progress';
import { aktivitaetProTag, glutKalender, meistVergessen, pruefungsVerlauf, trefferquote, type StatThema } from '../../src/lib/stats';

const karte = (ziel: string, zeit: string, bewertung: 1 | 2 | 3 | 4 = 3, geraet = 'pc'): Ereignis => ({ art: 'karte', ziel, zeit, geraet, bewertung });
const uebung = (ziel: string, zeit: string, richtig: boolean, geraet = 'pc'): Ereignis => ({ art: 'uebung', ziel, zeit, geraet, richtig });
const pruefung = (ziel: string, zeit: string, punkte: number, max: number): Ereignis => ({ art: 'pruefung', ziel, zeit, geraet: 'pc', punkte, max });

function topic(id: string, karten: string[], uebungen: string[], zurueck: string[] = []): Topic {
  return {
    id,
    fach: 'mathe',
    kapitel: '01 Analysis',
    titel: id,
    quellen: [],
    stand: '2026-11-22',
    zusammenfassung: '',
    mindmap: null,
    karten: karten.map((k, i) => ({ id: k, frage: `Frage ${k}`, antwort: 'A', zurueckgezogen: zurueck.includes(k), zeile: i + 1, ende: i + 1 })),
    uebungen: uebungen.map((u, i) => ({ id: u, typ: 'offen' as const, frage: `Übung ${u}`, musterloesung: 'M', zurueckgezogen: zurueck.includes(u), zeile: 100 + i, idZeile: null })),
    fehler: [],
  };
}

const THEMEN: StatThema[] = [
  { fachId: 'mathe', fachName: 'Mathe', kapitel: 'Analysis', topic: topic('t-abl', ['k-1', 'k-2', 'k-alt'], ['u-1'], ['k-alt']) },
  { fachId: 'mathe', fachName: 'Mathe', kapitel: 'Reihen', topic: topic('t-tay', ['k-3'], ['u-2', 'u-3']) },
  { fachId: 'phys', fachName: 'Physik', kapitel: 'Mechanik', topic: topic('t-mech', ['k-4'], []) },
];

describe('aktivitaetProTag', () => {
  // 24.11.2026 12:00 Wien = 11:00 UTC
  const jetzt = new Date('2026-11-24T11:00:00Z');

  it('leer: n Tage mit 0, letzter ist heute (Wien)', () => {
    const r = aktivitaetProTag([], 3, jetzt);
    expect(r).toEqual([
      { tag: '2026-11-22', karten: 0, uebungen: 0 },
      { tag: '2026-11-23', karten: 0, uebungen: 0 },
      { tag: '2026-11-24', karten: 0, uebungen: 0 },
    ]);
  });

  it('zählt Karten und Übungen aller Geräte je Wiener Kalendertag; Prüfungen nicht', () => {
    const r = aktivitaetProTag(
      [
        karte('k-1', '2026-11-23T22:30:00Z'), // 23:30 Wien → 23.
        karte('k-2', '2026-11-23T23:30:00Z', 1, 'handy'), // 00:30 Wien → 24.
        uebung('u-1', '2026-11-24T08:00:00Z', true),
        pruefung('mathe:x', '2026-11-24T09:00:00Z', 1, 2),
        karte('k-1', '2026-11-10T10:00:00Z'), // außerhalb
        karte('k-1', '2026-11-25T10:00:00Z'), // Zukunft
        { ...karte('k-1', 'kaputt') },
      ],
      2,
      jetzt,
    );
    expect(r).toEqual([
      { tag: '2026-11-23', karten: 1, uebungen: 0 },
      { tag: '2026-11-24', karten: 1, uebungen: 1 },
    ]);
  });

  it('über die Zeitumstellung (25.10.2026) bleiben die Tage lückenlos', () => {
    const r = aktivitaetProTag([karte('k-1', '2026-10-25T22:59:00Z')], 3, new Date('2026-10-26T10:00:00Z'));
    expect(r.map((d) => d.tag)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    // 22:59 UTC am 25.10. = 23:59 MEZ → noch der 25.
    expect(r[1]!.karten).toBe(1);
  });
});

describe('glutKalender', () => {
  const jetzt = new Date('2026-11-25T11:00:00Z'); // Mittwoch

  it('Wochen Mo–So, die letzte enthält heute; Tage nach heute sind als zukunft markiert', () => {
    const k = glutKalender([karte('k-1', '2026-11-24T10:00:00Z'), uebung('u-1', '2026-11-24T11:00:00Z', false), karte('k-1', '2026-11-16T10:00:00Z')], 2, jetzt);
    expect(k).toHaveLength(2);
    expect(k[0]!.map((d) => d.tag)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(k[1]![0]!.tag).toBe('2026-11-23');
    expect(k[0]![0]!.anzahl).toBe(1);
    expect(k[1]![1]).toEqual({ tag: '2026-11-24', anzahl: 2, zukunft: false });
    expect(k[1]![2]).toEqual({ tag: '2026-11-25', anzahl: 0, zukunft: false });
    expect(k[1]![3]!.zukunft).toBe(true);
    expect(k[1]![6]).toEqual({ tag: '2026-11-29', anzahl: 0, zukunft: true });
  });

  it('am Sonntag kurz vor Mitternacht Wien ist die Woche voll', () => {
    const k = glutKalender([], 1, new Date('2026-11-29T22:30:00Z')); // So 23:30 Wien
    expect(k[0]!.every((d) => !d.zukunft)).toBe(true);
    // 23:30 UTC ist in Wien schon Montag → neue Woche
    const m = glutKalender([], 1, new Date('2026-11-29T23:30:00Z'));
    expect(m[0]![0]!.tag).toBe('2026-11-30');
  });
});

describe('trefferquote', () => {
  it('Karten: Anteil Bewertungen ≠ 1; Übungen: Anteil richtig; je Fach und Kapitel, nur aktive Elemente', () => {
    const r = trefferquote(
      [
        karte('k-1', '2026-11-20T10:00:00Z', 1),
        karte('k-1', '2026-11-21T10:00:00Z', 3),
        karte('k-2', '2026-11-21T10:00:00Z', 2),
        karte('k-alt', '2026-11-21T10:00:00Z', 1), // zurückgezogen
        karte('k-fremd', '2026-11-21T10:00:00Z', 1), // in keinem Thema
        uebung('u-1', '2026-11-21T10:00:00Z', false),
        uebung('u-2', '2026-11-21T10:00:00Z', true),
        uebung('u-3', '2026-11-21T10:00:00Z', true),
        uebung('u-3', '2026-11-22T10:00:00Z', false, 'handy'),
        karte('k-4', '2026-11-22T10:00:00Z', 4),
      ],
      THEMEN,
    );
    expect(r.map((f) => f.fachId)).toEqual(['mathe', 'phys']);
    const m = r[0]!;
    expect(m.karten).toEqual({ treffer: 2, gesamt: 3 });
    expect(m.uebungen).toEqual({ treffer: 2, gesamt: 4 });
    expect(m.kapitel).toEqual([
      { kapitel: 'Analysis', karten: { treffer: 2, gesamt: 3 }, uebungen: { treffer: 0, gesamt: 1 } },
      { kapitel: 'Reihen', karten: { treffer: 0, gesamt: 0 }, uebungen: { treffer: 2, gesamt: 3 } },
    ]);
    expect(r[1]!.karten).toEqual({ treffer: 1, gesamt: 1 });
  });

  it('leer: Fächer mit 0 von 0', () => {
    const r = trefferquote([], THEMEN);
    expect(r[0]!.karten).toEqual({ treffer: 0, gesamt: 0 });
    expect(trefferquote([], [])).toEqual([]);
  });
});

describe('meistVergessen', () => {
  it('meiste „Nochmal“, Gleichstand: zuletzt vergessen zuerst; nur aktive Karten; höchstens n', () => {
    const r = meistVergessen(
      [
        karte('k-1', '2026-11-20T10:00:00Z', 1),
        karte('k-1', '2026-11-21T10:00:00Z', 1),
        karte('k-2', '2026-11-19T10:00:00Z', 1),
        karte('k-3', '2026-11-22T10:00:00Z', 1),
        karte('k-3', '2026-11-23T10:00:00Z', 3),
        karte('k-4', '2026-11-18T10:00:00Z', 3),
        karte('k-alt', '2026-11-22T10:00:00Z', 1),
        karte('k-alt', '2026-11-22T11:00:00Z', 1),
        karte('k-alt', '2026-11-22T12:00:00Z', 1),
      ],
      THEMEN,
      2,
    );
    expect(r.map((x) => [x.id, x.nochmal])).toEqual([
      ['k-1', 2],
      ['k-3', 1],
    ]);
    expect(r[0]).toMatchObject({ frage: 'Frage k-1', themaId: 't-abl', themaTitel: 't-abl', fachId: 'mathe', zuletzt: '2026-11-21T10:00:00Z' });
  });

  it('Standard n = 10, leer ohne Nochmal', () => {
    expect(meistVergessen([karte('k-1', '2026-11-20T10:00:00Z', 3)], THEMEN)).toEqual([]);
    const viele = Array.from({ length: 12 }, (_, i) => topic(`t${i}`, [`k-x${i}`], []));
    const themen = viele.map((t) => ({ fachId: 'f', fachName: 'F', kapitel: 'K', topic: t }));
    const ev = viele.map((_, i) => karte(`k-x${i}`, `2026-11-2${i % 10}T10:00:00Z`, 1));
    expect(meistVergessen(ev, themen)).toHaveLength(10);
  });
});

describe('pruefungsVerlauf', () => {
  it('Prüfungen und Proben in Zeitreihenfolge mit Prozent', () => {
    const r = pruefungsVerlauf([
      pruefung('probe:p1', '2026-11-22T10:00:00Z', 9.5, 12),
      karte('k-1', '2026-11-21T10:00:00Z'),
      pruefung('mathe:01 Analysis', '2026-11-20T10:00:00Z', 3, 4),
      pruefung('mathe:leer', '2026-11-23T10:00:00Z', 0, 0),
    ]);
    expect(r).toEqual([
      { zeit: '2026-11-20T10:00:00Z', ziel: 'mathe:01 Analysis', art: 'pruefung', punkte: 3, max: 4, prozent: 75 },
      { zeit: '2026-11-22T10:00:00Z', ziel: 'probe:p1', art: 'probe', punkte: 9.5, max: 12, prozent: 79.17 },
      { zeit: '2026-11-23T10:00:00Z', ziel: 'mathe:leer', art: 'pruefung', punkte: 0, max: 0, prozent: 0 },
    ]);
    expect(pruefungsVerlauf([])).toEqual([]);
  });
});
