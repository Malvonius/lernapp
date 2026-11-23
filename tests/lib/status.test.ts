import { describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard } from 'ts-fsrs';
import type { IndexTopic } from '../../src/format/types';
import { fachStatus, kapitelStatus, themaStatus } from '../../src/lib/status';

const t0 = new Date('2026-11-01T10:00:00Z');
const sched = fsrs(generatorParameters({ enable_fuzz: false }));
const thema = (o: Partial<IndexTopic> = {}): IndexTopic => ({
  id: 'x', titel: 'X', pfad: 'F/X.md', hash: 'h', karten: 2, uebungen: 0, hatMindmap: false, fehler: [], ...o,
});
/** Karte, die einmal mit „Gut“ bewertet wurde. */
const bewertet = (): FsrsCard => sched.next(createEmptyCard(t0), t0, Rating.Good).card;
const tage = (n: number) => new Date(t0.getTime() + n * 86400_000);

describe('themaStatus', () => {
  it('ohne Pfad → luecke (auch mit Fehlern)', () => {
    expect(themaStatus(thema({ pfad: null }), [], new Map(), t0)).toBe('luecke');
    expect(themaStatus(thema({ pfad: null, fehler: ['x'] }), [], new Map(), t0)).toBe('luecke');
  });
  it('mit Fehlern → fehlerhaft', () => {
    expect(themaStatus(thema({ fehler: ['kaputt'] }), ['a'], new Map([['a', bewertet()]]), t0)).toBe('fehlerhaft');
  });
  it('keine Karte je bewertet (oder gar keine Karten) → neu', () => {
    expect(themaStatus(thema(), ['a', 'b'], new Map(), t0)).toBe('neu');
    expect(themaStatus(thema(), [], new Map(), t0)).toBe('neu');
  });
  it('alle Karten frisch bewertet → gruen', () => {
    const z = new Map([['a', bewertet()], ['b', bewertet()]]);
    expect(themaStatus(thema(), ['a', 'b'], z, t0)).toBe('gruen');
  });
  it('lange nicht wiederholt → rot', () => {
    const z = new Map([['a', bewertet()], ['b', bewertet()]]);
    expect(themaStatus(thema(), ['a', 'b'], z, tage(400))).toBe('rot');
  });
  it('unbewertete Karten zählen als 0: 3 von 4 abrufbar → gelb, 1 von 2 → gelb, 1 von 3 → rot', () => {
    const z = new Map([['a', bewertet()], ['b', bewertet()], ['c', bewertet()]]);
    expect(themaStatus(thema(), ['a', 'b', 'c', 'd'], z, t0)).toBe('gelb'); // 0,75
    expect(themaStatus(thema(), ['a', 'd'], z, t0)).toBe('gelb'); // 0,5
    expect(themaStatus(thema(), ['a', 'd', 'e'], z, t0)).toBe('rot'); // 0,33
  });
  it('Grenze: 4 von 5 abrufbar (0,8) → gruen', () => {
    const z = new Map(['a', 'b', 'c', 'd'].map((k) => [k, bewertet()] as const));
    expect(themaStatus(thema(), ['a', 'b', 'c', 'd', 'e'], z, t0)).toBe('gruen');
  });
});

describe('kapitelStatus', () => {
  it('nimmt das schlechteste Ergebnis', () => {
    expect(kapitelStatus(['gruen', 'gelb', 'gruen'])).toBe('gelb');
    expect(kapitelStatus(['gruen', 'rot', 'gelb'])).toBe('rot');
    expect(kapitelStatus(['gruen', 'neu'])).toBe('neu');
    expect(kapitelStatus(['gruen', 'gruen'])).toBe('gruen');
  });
  it('Lücken und fehlerhafte zählen nicht mit, solange es andere gibt', () => {
    expect(kapitelStatus(['luecke', 'gruen', 'fehlerhaft'])).toBe('gruen');
  });
  it('nur Lücken → luecke; nur fehlerhafte (auch mit Lücken) → fehlerhaft; leer → luecke', () => {
    expect(kapitelStatus(['luecke', 'luecke'])).toBe('luecke');
    expect(kapitelStatus(['fehlerhaft', 'luecke'])).toBe('fehlerhaft');
    expect(kapitelStatus([])).toBe('luecke');
  });
});

describe('themaStatus mit Übungen', () => {
  const stand = (e: Record<string, boolean>) => new Map(Object.entries(e).map(([id, r]) => [id, { zuletztRichtig: r }]));

  it('nur Übungen, keine versucht → neu', () => {
    expect(themaStatus(thema({ karten: 0 }), [], new Map(), t0, { ids: ['u1', 'u2'], stand: new Map() })).toBe('neu');
  });
  it('nur Übungen, alle zuletzt richtig → gruen (nicht ewig „neu“)', () => {
    expect(themaStatus(thema({ karten: 0 }), [], new Map(), t0, { ids: ['u1', 'u2'], stand: stand({ u1: true, u2: true }) })).toBe('gruen');
  });
  it('nur Übungen: zuletzt falsch zählt 0, unversuchte auch (1 von 2 → gelb, 1 von 3 → rot)', () => {
    expect(themaStatus(thema(), [], new Map(), t0, { ids: ['u1', 'u2'], stand: stand({ u1: true, u2: false }) })).toBe('gelb');
    expect(themaStatus(thema(), [], new Map(), t0, { ids: ['u1', 'u2', 'u3'], stand: stand({ u1: true }) })).toBe('rot');
  });
  it('Karten und Übungen: Mittel aus Abrufquote und Übungsquote', () => {
    const z = new Map([['a', bewertet()]]);
    // Karten 1,0 · Übungen 0/2 → 0,5 → gelb
    expect(themaStatus(thema(), ['a'], z, t0, { ids: ['u1', 'u2'], stand: stand({ u1: false }) })).toBe('gelb');
    // Karten 1,0 · Übungen 2/2 → 1,0 → gruen
    expect(themaStatus(thema(), ['a'], z, t0, { ids: ['u1', 'u2'], stand: stand({ u1: true, u2: true }) })).toBe('gruen');
    // Karten 0 (nie bewertet) · Übungen 2/2 → 0,5 → gelb
    expect(themaStatus(thema(), ['a', 'b'], new Map(), t0, { ids: ['u1', 'u2'], stand: stand({ u1: true, u2: true }) })).toBe('gelb');
  });
  it('Ergebnisse fremder (z. B. zurückgezogener) Übungen zählen nicht', () => {
    expect(themaStatus(thema(), [], new Map(), t0, { ids: ['u1'], stand: stand({ alt: true }) })).toBe('neu');
  });
  it('fachStatus reicht die Übungen durch', () => {
    const fach = { id: 'f', name: 'F', farbe: '#fff', kapitel: [{ ordner: 'k', titel: 'K', themen: [thema({ karten: 0 })] }], nichtZugeordnet: [] } as never;
    expect(fachStatus(fach, () => [], new Map(), t0, { ids: () => ['u1'], stand: stand({ u1: true }) })).toEqual(['gruen']);
  });
});
