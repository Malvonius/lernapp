import { describe, expect, it } from 'vitest';
import type { Card, Exercise, Topic } from '../../src/format/types';
import { bauePruefung, werteAus } from '../../src/lib/exam';

function rngVon(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const karte = (id: string | null, zurueckgezogen = false): Card => ({ id, frage: 'F', antwort: 'A', zurueckgezogen, zeile: 1, ende: 2 });
const uebung = (id: string | null, zurueckgezogen = false): Exercise => ({ id, typ: 'offen', frage: 'F', zurueckgezogen, zeile: 1, idZeile: null });
function topic(id: string, kapitel: string, nKarten: number, nUebungen: number): Topic {
  return {
    id,
    fach: 'mathe',
    kapitel,
    titel: id,
    quellen: [],
    stand: '',
    zusammenfassung: '',
    mindmap: null,
    karten: Array.from({ length: nKarten }, (_, i) => karte(`k-${id}${i}`)),
    uebungen: Array.from({ length: nUebungen }, (_, i) => uebung(`u-${id}${i}`)),
    fehler: [],
  };
}
const eingabe = (kapitel: string, t: Topic) => ({ fach: 'mathe', kapitel, topic: t });

describe('bauePruefung', () => {
  const themen = [eingabe('A', topic('a', 'A', 5, 5)), eingabe('B', topic('b', 'B', 5, 5))];

  it('ist mit gleichem rng deterministisch', () => {
    expect(bauePruefung(themen, 6, rngVon(1))).toEqual(bauePruefung(themen, 6, rngVon(1)));
  });

  it('verteilt gleichmäßig auf Kapitel', () => {
    const r = bauePruefung(themen, 4, rngVon(2));
    expect(r).toHaveLength(4);
    expect(r.filter((a) => a.kapitel === 'A')).toHaveLength(2);
    expect(r.filter((a) => a.kapitel === 'B')).toHaveLength(2);
  });

  it('nimmt mindestens die Hälfte Übungen, wenn genug da sind', () => {
    for (const seed of [1, 2, 3]) {
      const r = bauePruefung(themen, 7, rngVon(seed));
      expect(r.filter((a) => a.art === 'uebung').length).toBeGreaterThanOrEqual(4);
    }
  });

  it('erreicht die Hälfte auch, wenn ein Kapitel keine Übungen hat', () => {
    const t = [eingabe('A', topic('a', 'A', 5, 0)), eingabe('B', topic('b', 'B', 5, 5))];
    const r = bauePruefung(t, 6, rngVon(4));
    expect(r.filter((a) => a.art === 'uebung')).toHaveLength(3);
  });

  it('nimmt bei zu großer Anzahl alles, ohne Duplikate', () => {
    const t = [eingabe('A', topic('a', 'A', 2, 1)), eingabe('A', topic('a', 'A', 2, 1)), eingabe('B', topic('b', 'B', 1, 1))];
    const r = bauePruefung(t, 30, rngVon(5));
    expect(r).toHaveLength(3 + 2);
    expect(new Set(r.map((a) => a.id)).size).toBe(r.length);
  });

  it('nimmt nur aktive Elemente mit ID', () => {
    const t = topic('a', 'A', 0, 0);
    t.karten = [karte('k-1'), karte('k-2', true), karte(null)];
    t.uebungen = [uebung('u-1'), uebung('u-2', true), uebung(null)];
    const r = bauePruefung([eingabe('A', t)], 10, rngVon(6));
    expect(r.map((a) => a.id).sort()).toEqual(['k-1', 'u-1']);
    expect(r.every((a) => a.themaId === 'a' && a.kapitel === 'A')).toBe(true);
  });

  it('liefert bei leerer Eingabe oder anzahl 0 nichts', () => {
    expect(bauePruefung([], 10, rngVon(1))).toEqual([]);
    expect(bauePruefung(themen, 0, rngVon(1))).toEqual([]);
  });
});

describe('werteAus', () => {
  it('rechnet Punkte gesamt und pro Kapitel; Fehlendes zählt als falsch', () => {
    const aufgaben = [
      { art: 'karte' as const, themaId: 'a', kapitel: 'A', id: 'k1' },
      { art: 'uebung' as const, themaId: 'a', kapitel: 'A', id: 'u1' },
      { art: 'uebung' as const, themaId: 'b', kapitel: 'B', id: 'u2' },
      { art: 'karte' as const, themaId: 'b', kapitel: 'B', id: 'k2' },
    ];
    const r = werteAus(aufgaben, new Map([['k1', true], ['u1', false], ['u2', true]]));
    expect(r).toEqual({
      punkte: 2,
      max: 4,
      kapitel: [
        { kapitel: 'A', punkte: 1, max: 2 },
        { kapitel: 'B', punkte: 1, max: 2 },
      ],
    });
  });
});
