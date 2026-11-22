import { describe, expect, it } from 'vitest';
import { ensureIds } from '../../src/format/ids';
import { parseTopic } from '../../src/format/parseTopic';

const FM = '---\nid: t\nfach: f\nkapitel: 01 K\ntitel: T\nquellen: []\nstand: 2026-11-22\n---\n# T\n\n';
const FENCE = '```';

describe('C1: Text nach bestehender ID', () => {
  const text = FM + '## Lernkarten\n\n**F:** Frage?\n**A:** Antwort ^k-aaaaaa\nNachtrag\n';
  it('behält die bestehende ID und entfernt sie aus der Antwort', () => {
    const k = parseTopic(text).karten[0]!;
    expect(k.id).toBe('k-aaaaaa');
    expect(k.antwort).toContain('Nachtrag');
    expect(k.antwort).not.toContain('^k-');
  });
  it('ensureIds ändert nichts', () => {
    expect(ensureIds(text, new Set())).toEqual({ text, added: [] });
  });
});

describe('C2: ungültiges Frontmatter', () => {
  const text = '---\nid: t\ntitel: Taylor: Reihen\n---\n# X\n\n## Zusammenfassung\nText drei\n\n## Lernkarten\n\n**F:** Frage?\n**A:** Antwort\n';
  it('Zeilennummern der Karten stimmen trotzdem', () => {
    const t = parseTopic(text);
    expect(t.fehler.join()).toMatch(/Frontmatter/);
    expect(text.split('\n')[t.karten[0]!.zeile - 1]).toMatch(/^\*\*F:\*\*/);
  });
  it('ensureIds fasst die Datei nicht an', () => {
    expect(ensureIds(text, new Set())).toEqual({ text, added: [] });
  });
});

describe('I1: ## in einem Code-Block der Antwort', () => {
  const text = FM + '## Lernkarten\n\n**F:** Code?\n**A:** So:\n' + FENCE + 'python\n## kommentar\nprint(1)\n' + FENCE + '\nFertig.\n';
  it('vergibt die ID einmal, stabil, und lässt den Block intakt', () => {
    const once = ensureIds(text, new Set());
    expect(once.added).toHaveLength(1);
    expect(once.text).toContain(FENCE + 'python\n## kommentar');
    expect(parseTopic(once.text).karten[0]!.id).toBe(once.added[0]);
    expect(ensureIds(once.text, new Set()).added).toEqual([]);
  });
});

describe('I2: Karte endet mit Code-Block oder $$', () => {
  it('ID kommt in eine eigene Zeile nach dem schließenden Fence', () => {
    const text = FM + '## Lernkarten\n\n**F:** Code?\n**A:** So:\n' + FENCE + '\nx = 1\n' + FENCE + '\n\n**F:** Zwei?\n**A:** B\n';
    const r = ensureIds(text, new Set());
    const lines = r.text.split('\n');
    const close = lines.lastIndexOf(FENCE);
    expect(lines[close]).toBe(FENCE);
    expect(lines[close + 1]).toMatch(/^\^k-[a-z0-9]{6}$/);
    const t = parseTopic(r.text);
    expect(t.karten.map((k) => k.id)).toEqual(r.added);
    expect(t.karten[0]!.antwort.endsWith(FENCE)).toBe(true);
  });
  it('auch nach einem schließenden $$', () => {
    const text = FM + '## Lernkarten\n\n**F:** Formel?\n**A:** Siehe\n$$\nx^2\n$$\n';
    const r = ensureIds(text, new Set());
    expect(r.text).toMatch(/\n\$\$\n\^k-[a-z0-9]{6}\n$/);
    expect(parseTopic(r.text).karten[0]!.id).toBe(r.added[0]);
  });
});

describe('I3: leere oder ungültige Übungs-ID', () => {
  for (const bad of ['id: ""', 'id:', 'id: 42', 'id: meine-id']) {
    it(`ersetzt "${bad}" statt eine zweite id-Zeile einzufügen`, () => {
      const text = FM + '## Übungen\n\n' + FENCE + 'uebung\n' + bad + '\ntyp: offen\nfrage: "F?"\nmusterloesung: "M"\n' + FENCE + '\n';
      const r = ensureIds(text, new Set());
      expect(r.added).toHaveLength(1);
      const t = parseTopic(r.text);
      expect(t.fehler).toEqual([]);
      expect(t.uebungen[0]!.id).toBe(r.added[0]);
      expect(r.text.match(/^id:/gm)).toHaveLength(2); // Frontmatter + Übung
    });
  }
});
