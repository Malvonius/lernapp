import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../src/format/types';
import { parseZahl, pruefeEingabe, pruefeMc } from '../../src/lib/check';

const ex = (p: Partial<Exercise>): Exercise => ({
  id: 'u-1',
  typ: 'eingabe',
  frage: 'f',
  zurueckgezogen: false,
  zeile: 1,
  idZeile: null,
  ...p,
});

describe('parseZahl', () => {
  it.each([
    ['1,35 %', 1.35],
    ['24.703,21', 24703.21],
    ['24 703,21 €', 24703.21],
    ['24 703,21', 24703.21],
    ['-0,3889', -0.3889],
    ['−0,5', -0.5],
    ['1.35', 1.35],
    ['1.234.567', 1234567],
    ['24,703.21', 24703.21],
    ['12', 12],
    ['  4,7 kΩ ', 4.7],
    ['100 mm', 100],
    ['5 m', 5],
    ['3.', 3],
  ])('%s → %s', (eingabe, erwartet) => {
    expect(parseZahl(eingabe)).toBeCloseTo(erwartet, 9);
  });

  it.each(['abc', '', '   ', '1,2,3', '1 2', '€ 5', ',', '-'])('%j → null', (eingabe) => {
    expect(parseZahl(eingabe)).toBeNull();
  });
});

describe('pruefeEingabe', () => {
  it('Zahl mit Toleranz', () => {
    const e = ex({ loesung: 2.67, toleranz: 0.01 });
    expect(pruefeEingabe(e, '2,666')).toBe(true);
    expect(pruefeEingabe(e, '2,7')).toBe(false);
  });
  it('Zahl ohne Toleranz ist praktisch exakt', () => {
    expect(pruefeEingabe(ex({ loesung: 12 }), '12')).toBe(true);
    expect(pruefeEingabe(ex({ loesung: 12 }), '12,001')).toBe(false);
  });
  it('Einheit wird ignoriert, Unsinn ist falsch', () => {
    expect(pruefeEingabe(ex({ loesung: 1.35 }), '1,35 %')).toBe(true);
    expect(pruefeEingabe(ex({ loesung: 1.35 }), 'abc')).toBe(false);
  });
  it('Text: getrimmt, ohne Groß/Klein, Whitespace zusammengefasst', () => {
    const e = ex({ loesung: 'Kettenregel' });
    expect(pruefeEingabe(e, '  kettenREGEL ')).toBe(true);
    expect(pruefeEingabe(ex({ loesung: 'a  b' }), 'A b')).toBe(true);
    expect(pruefeEingabe(e, 'Produktregel')).toBe(false);
  });
  it('ohne Lösung nie richtig', () => {
    expect(pruefeEingabe(ex({}), '1')).toBe(false);
  });
});

describe('pruefeMc', () => {
  const e = ex({ typ: 'mc', optionen: ['a', 'b', 'c', 'd'], richtig: [0, 2, 3] });
  it('verlangt genau die richtige Menge', () => {
    expect(pruefeMc(e, [0, 2])).toBe(false);
    expect(pruefeMc(e, [3, 0, 2])).toBe(true);
    expect(pruefeMc(e, [0, 1, 2, 3])).toBe(false);
    expect(pruefeMc(e, [])).toBe(false);
  });
});
