import { describe, expect, it } from 'vitest';
import type { Exercise, NotenStufe } from '../../src/format/types';
import { bewerte, formatProzent, letztesErgebnis, note, teilPunkte, type Antwort } from '../../src/lib/probe';

const ex = (typ: Exercise['typ'], punkte: number, id = `u-${typ}`): Exercise => ({ id, typ, frage: '?', punkte, zurueckgezogen: false, zeile: 1, idZeile: null });

const SCHLUESSEL: NotenStufe[] = [
  { note: 1, abProzent: 88 },
  { note: 2, abProzent: 75 },
  { note: 3, abProzent: 62 },
  { note: 4, abProzent: 50 },
];

describe('teilPunkte', () => {
  it('halbe Punkte, auf 0,5 gerundet', () => {
    expect(teilPunkte(4)).toBe(2);
    expect(teilPunkte(5)).toBe(2.5);
    expect(teilPunkte(3)).toBe(1.5);
    expect(teilPunkte(1)).toBe(0.5);
    expect(teilPunkte(1.5)).toBe(1); // 0,75 → 1
    expect(teilPunkte(2.5)).toBe(1.5); // 1,25 → 1,5
    expect(teilPunkte(7)).toBe(3.5);
  });
});

describe('bewerte', () => {
  const aufgaben = [ex('eingabe', 4), ex('mc', 3), ex('offen', 5), ex('schritte', 3)];

  it('automatisch: volle Punkte oder 0; Selbsteinschätzung voll/teilweise/keine', () => {
    const antworten = new Map<number, Antwort>([
      [0, { art: 'auto', richtig: true }],
      [1, { art: 'auto', richtig: false }],
      [2, { art: 'selbst', stufe: 'teilweise' }],
      [3, { art: 'selbst', stufe: 'voll' }],
    ]);
    const a = bewerte(aufgaben, antworten);
    expect(a.aufgaben.map((x) => [x.punkte, x.max, x.stufe])).toEqual([
      [4, 4, 'voll'],
      [0, 3, 'keine'],
      [2.5, 5, 'teilweise'],
      [3, 3, 'voll'],
    ]);
    expect(a.punkte).toBe(9.5);
    expect(a.max).toBe(15);
    expect(a.prozent).toBeCloseTo(63.33, 2);
  });

  it('unbeantwortete Aufgaben zählen 0 und sind als offen markiert', () => {
    const a = bewerte(aufgaben, new Map([[0, { art: 'auto', richtig: true }]]));
    expect(a.punkte).toBe(4);
    expect(a.aufgaben.slice(1).map((x) => x.stufe)).toEqual(['offen', 'offen', 'offen']);
  });

  it('zurückgezogene Aufgaben zählen nicht zum Maximum', () => {
    const mitAlt = [...aufgaben, { ...ex('eingabe', 10, 'u-alt'), zurueckgezogen: true }];
    expect(bewerte(mitAlt, new Map()).max).toBe(15);
  });

  it('keine Aufgaben: 0 von 0, 0 Prozent', () => {
    expect(bewerte([], new Map())).toEqual({ punkte: 0, max: 0, prozent: 0, aufgaben: [] });
  });

  it('volle Punktzahl ergibt genau 100 Prozent', () => {
    const alle = new Map<number, Antwort>(aufgaben.map((_, i) => [i, { art: 'selbst', stufe: 'voll' }]));
    expect(bewerte(aufgaben, alle).prozent).toBe(100);
  });
});

describe('note', () => {
  it('ohne Schlüssel: null', () => {
    expect(note(95, null)).toBeNull();
  });

  it('genau auf dem Schwellwert zählt die bessere Note', () => {
    expect(note(88, SCHLUESSEL)).toBe(1);
    expect(note(75, SCHLUESSEL)).toBe(2);
    expect(note(62, SCHLUESSEL)).toBe(3);
    expect(note(50, SCHLUESSEL)).toBe(4);
  });

  it('knapp darunter die nächste Note', () => {
    expect(note(87.99, SCHLUESSEL)).toBe(2);
    expect(note(74.9, SCHLUESSEL)).toBe(3);
    expect(note(49.99, SCHLUESSEL)).toBe(5);
  });

  it('unter der niedrigsten Schwelle: 5; 100 % und 0 %', () => {
    expect(note(100, SCHLUESSEL)).toBe(1);
    expect(note(0, SCHLUESSEL)).toBe(5);
    expect(note(0, [...SCHLUESSEL, { note: 5, abProzent: 0 }])).toBe(5);
  });

  it('Bruchpunkte genau auf der Grenze (22 von 25 = 88 %)', () => {
    const a = bewerte([ex('offen', 25)], new Map());
    expect(a.prozent).toBe(0);
    const p = bewerte(
      Array.from({ length: 25 }, (_, i) => ex('eingabe', 1, `u-${i}`)),
      new Map(Array.from({ length: 22 }, (_, i) => [i, { art: 'auto', richtig: true } as Antwort])),
    ).prozent;
    expect(p).toBe(88);
    expect(note(p, SCHLUESSEL)).toBe(1);
  });
});

describe('formatProzent', () => {
  it('deutsch, höchstens eine Nachkommastelle, nie aufgerundet über eine Grenze', () => {
    expect(formatProzent(88)).toBe('88 %');
    expect(formatProzent(63.333)).toBe('63,3 %');
    expect(formatProzent(87.96)).toBe('87,9 %');
    expect(formatProzent(100)).toBe('100 %');
    expect(formatProzent(0)).toBe('0 %');
  });
});

describe('letztesErgebnis', () => {
  const ev = (ziel: string, zeit: string, punkte: number, geraet = 'pc') => ({ art: 'pruefung' as const, ziel, zeit, geraet, punkte, max: 12 });
  it('jüngstes pruefung-Ereignis mit ziel probe:<id>, über alle Geräte; sonst null', () => {
    const liste = [
      ev('probe:p1', '2026-11-21T10:00:00.000Z', 9.5, 'handy'),
      ev('probe:p1', '2026-11-20T10:00:00.000Z', 5),
      ev('probe:p2', '2026-11-22T10:00:00.000Z', 1),
      { art: 'uebung' as const, ziel: 'probe:p1', zeit: '2026-11-23T10:00:00.000Z', geraet: 'pc', richtig: true },
    ];
    expect(letztesErgebnis(liste, 'p1')).toMatchObject({ punkte: 9.5, max: 12 });
    expect(letztesErgebnis(liste, 'p3')).toBeNull();
    expect(letztesErgebnis([], 'p1')).toBeNull();
  });
});
