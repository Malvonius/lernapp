import { describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard } from 'ts-fsrs';
import type { IndexTopic } from '../../src/format/types';
import { kapitelStatus, themaStatus } from '../../src/lib/status';

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
