import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSubject } from '../../src/format/parseSubject';

const fixture = readFileSync(
  fileURLToPath(new URL('../fixtures/lernstoff-mini/Mathe/Mathe.md', import.meta.url)),
  'utf8',
);

describe('parseSubject', () => {
  const s = parseSubject(fixture);

  it('liest Frontmatter', () => {
    expect(s).toMatchObject({ id: 'mathe', name: 'Angewandte Mathematik', kuerzel: 'AM', farbe: '#7c5cff', struktur: 'vorlaeufig' });
    expect(s.fehler).toEqual([]);
  });

  it('liest Kapitel mit Ordnername und Titel ohne Nummer', () => {
    expect(s.kapitel.map((k) => k.ordner)).toEqual(['01 Analysis', '02 Reihen & Differentialgleichungen']);
    expect(s.kapitel[0]!.titel).toBe('Analysis');
    expect(s.kapitel[0]!.themen).toEqual([
      { datei: 'Ableitungen', titel: 'Ableitungen' },
      { datei: 'Kurvendiskussion', titel: 'Kurvendiskussion' },
    ]);
  });

  it('liest Anzeigetitel aus [[datei|titel]]', () => {
    expect(s.kapitel[1]!.themen[0]).toEqual({ datei: 'Taylor & DG', titel: 'Taylorreihen und DG' });
  });

  it('meldet ungültige Farbe', () => {
    expect(parseSubject(fixture.replace('"#7c5cff"', 'rot')).fehler.join()).toMatch(/farbe/);
  });

  it('meldet ungültige Struktur', () => {
    expect(parseSubject(fixture.replace('struktur: vorlaeufig', 'struktur: egal')).fehler.join()).toMatch(/struktur/);
  });

  it('parst CRLF identisch', () => {
    expect(parseSubject(fixture.replace(/\r?\n/g, '\r\n'))).toEqual(s);
  });
});
