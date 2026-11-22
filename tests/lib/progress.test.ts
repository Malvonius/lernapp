import { describe, expect, it } from 'vitest';
import { dueCards, mergeEvents, replayCards, uebungStand, type Ereignis } from '../../src/lib/progress';

const karte = (geraet: string, zeit: string, bewertung: 1 | 2 | 3 | 4, ziel = 'k1'): Ereignis => ({
  art: 'karte', ziel, zeit, geraet, bewertung,
});

describe('mergeEvents', () => {
  const pc = [karte('pc', '2026-01-01T10:00:00.000Z', 3)];
  const handy = [karte('handy', '2026-01-01T10:00:00.000Z', 4)];

  it('dedupliziert identische Ereignisse', () => {
    expect(mergeEvents(pc, pc)).toEqual(pc);
  });
  it('ist unabhaengig von der Reihenfolge der Listen', () => {
    expect(mergeEvents(pc, handy)).toEqual(mergeEvents(handy, pc));
    expect(mergeEvents(pc, handy)).toHaveLength(2);
  });
  it('sortiert nach zeit, dann geraet', () => {
    const spaeter = karte('pc', '2026-01-02T10:00:00.000Z', 3);
    const r = mergeEvents([spaeter], handy, pc);
    expect(r.map((e) => e.geraet)).toEqual(['handy', 'pc', 'pc']);
    expect(r[2]!).toEqual(spaeter);
  });
  it('unterscheidet art und ziel im Schluessel', () => {
    const u: Ereignis = { art: 'uebung', ziel: 'k1', zeit: pc[0]!.zeit, geraet: 'pc', richtig: true };
    expect(mergeEvents(pc, [u])).toHaveLength(2);
  });
});

describe('replayCards', () => {
  const pc = [karte('pc', '2026-01-01T10:00:00.000Z', 3)];
  const handy = [karte('handy', '2026-01-02T10:00:00.000Z', 3)];

  it('zwei Geraete offline: gleiches Ergebnis, reps = 2', () => {
    const a = replayCards(mergeEvents(pc, handy));
    const b = replayCards(mergeEvents(handy, pc));
    expect(a).toEqual(b);
    expect(a.get('k1')?.reps).toBe(2);
  });
  it('Nochmal ist nach 1 Minute faellig, Einfach nicht', () => {
    const t = new Date('2026-01-01T10:00:00.000Z');
    const nach = new Date(t.getTime() + 60_000);
    const again = replayCards([karte('pc', t.toISOString(), 1, 'a')]);
    const easy = replayCards([karte('pc', t.toISOString(), 4, 'b')]);
    expect(dueCards(again, ['a'], nach)).toEqual(['a']);
    expect(dueCards(easy, ['b'], nach)).toEqual([]);
  });
  it('ignoriert Uebungs- und Pruefungsereignisse', () => {
    const u: Ereignis = { art: 'uebung', ziel: 'u1', zeit: '2026-01-01T10:00:00.000Z', geraet: 'pc', richtig: true };
    expect(replayCards([u]).size).toBe(0);
  });
});

describe('dueCards', () => {
  it('neue Karte ohne Ereignis ist faellig', () => {
    expect(dueCards(new Map(), ['neu'], new Date())).toEqual(['neu']);
  });
});

describe('uebungStand', () => {
  it('zaehlt Versuche und letztes Ergebnis', () => {
    const ev: Ereignis[] = [
      { art: 'uebung', ziel: 'u1', zeit: '2026-01-01T10:00:00.000Z', geraet: 'pc', richtig: false },
      { art: 'uebung', ziel: 'u1', zeit: '2026-01-01T10:05:00.000Z', geraet: 'pc', richtig: true },
    ];
    expect(uebungStand(ev).get('u1')).toEqual({ versuche: 2, zuletztRichtig: true });
  });
});
