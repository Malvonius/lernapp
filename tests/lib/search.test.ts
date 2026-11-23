import { beforeAll, describe, expect, it } from 'vitest';
import { suche, bereiche } from '../../src/lib/search';
import { parseTopic } from '../../src/format/parseTopic';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../ui/fakes';
import type { Topic } from '../../src/format/types';

let ableitungen: Topic;
let taylor: Topic;
beforeAll(async () => {
  ableitungen = parseTopic(await readFile(join(ROOT, 'Mathe', '01 Analysis', 'Ableitungen.md'), 'utf8'));
  taylor = parseTopic(await readFile(join(ROOT, 'Mathe', '02 Reihen & Differentialgleichungen', 'Taylor & DG.md'), 'utf8'));
});

const liste = () => [
  { pfad: 'Mathe/01 Analysis/Ableitungen.md', topic: ableitungen, fachName: 'Mathe' },
  { pfad: 'Mathe/02/Taylor.md', topic: taylor, fachName: 'Mathe' },
];

describe('suche', () => {
  it('„kettenregel“ findet die Karte (und keine zurückgezogene)', () => {
    const t = suche(liste(), 'kettenregel');
    expect(t.some((x) => x.wo === 'karte' && x.pfad.endsWith('Ableitungen.md'))).toBe(true);
    expect(suche(liste(), 'Alte Karte')).toEqual([]);
  });

  it('Titeltreffer steht vor Text- und Kartentreffern', () => {
    const t = suche(liste(), 'Ableitung');
    expect(t[0]?.wo).toBe('titel');
    const woReihe = t.map((x) => x.wo);
    expect(woReihe.lastIndexOf('titel')).toBeLessThan(woReihe.indexOf('text'));
    expect(woReihe.lastIndexOf('text')).toBeLessThan(woReihe.indexOf('karte'));
  });

  it('Umlaut-Varianten und Groß/Klein: „Qualitaet“ findet „Qualität“', () => {
    const topic: Topic = { ...taylor, titel: 'Qualität', zusammenfassung: '', karten: [] };
    const t = suche([{ pfad: 'x.md', topic, fachName: 'QM' }], 'QUALITAET');
    expect(t).toHaveLength(1);
    expect(suche([{ pfad: 'x.md', topic, fachName: 'QM' }], 'qualität')).toHaveLength(1);
  });

  it('mehrere Wörter: alle müssen vorkommen, Reihenfolge egal', () => {
    expect(suche(liste(), 'ableitung kettenregel').length).toBeGreaterThan(0);
    expect(suche(liste(), 'kettenregel taylorpolynom')).toEqual([]);
  });

  it('leere Suche → []', () => {
    expect(suche(liste(), '')).toEqual([]);
    expect(suche(liste(), '   ')).toEqual([]);
  });

  it('höchstens 50 Treffer', () => {
    const viele = Array.from({ length: 80 }, (_, i) => ({ pfad: `t${i}.md`, topic: { ...taylor, titel: `Treffer ${i}` }, fachName: 'F' }));
    expect(suche(viele, 'treffer')).toHaveLength(50);
  });

  it('ausschnitt: um den Treffer, mit „…“ an abgeschnittenen Enden', () => {
    const lang = 'a'.repeat(300) + ' Zielwort ' + 'b'.repeat(300);
    const topic: Topic = { ...taylor, titel: 'T', zusammenfassung: lang, karten: [] };
    const [t] = suche([{ pfad: 'x.md', topic, fachName: 'F' }], 'zielwort');
    expect(t?.wo).toBe('text');
    expect(t?.ausschnitt).toContain('Zielwort');
    expect(t?.ausschnitt.startsWith('…')).toBe(true);
    expect(t?.ausschnitt.endsWith('…')).toBe(true);
    expect(t!.ausschnitt.length).toBeLessThanOrEqual(130);
  });
});

describe('bereiche', () => {
  it('liefert Positionen im Originaltext, auch bei Umlaut-Normalisierung', () => {
    expect(bereiche('Die Qualität zählt', 'qualitaet')).toEqual([[4, 12]]);
    expect(bereiche('Straße', 'strasse')).toEqual([[0, 6]]);
    expect(bereiche('abc', '')).toEqual([]);
  });
});
