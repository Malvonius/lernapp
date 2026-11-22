import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTopic } from '../../src/format/parseTopic';

const fixture = readFileSync(
  fileURLToPath(new URL('../fixtures/lernstoff-mini/Mathe/01 Analysis/Ableitungen.md', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

describe('parseTopic', () => {
  const t = parseTopic(fixture);

  it('liest Frontmatter', () => {
    expect(t.id).toBe('mathe-ableitungen');
    expect(t.kapitel).toBe('01 Analysis');
    expect(t.stand).toBe('2026-11-22');
    expect(t.quellen).toEqual(['[[_quellen/Mathe/Beispiel.docx]]']);
    expect(t.fehler).toEqual([]);
  });

  it('liest drei Karten inkl. mehrzeiliger Antwort und zurückgezogener Karte', () => {
    expect(t.karten).toHaveLength(3);
    expect(t.karten[0]).toMatchObject({ id: 'k-a1b2c3', frage: 'Was ist die Ableitung von $x^n$?', antwort: String.raw`$n \cdot x^{n-1}$`, zurueckgezogen: false });
    expect(t.karten[1]!.id).toBe('k-d4e5f6');
    expect(t.karten[1]!.antwort).toContain('\n\n$$');
    expect(t.karten[1]!.antwort).toContain('Beispiel');
    expect(t.karten[1]!.antwort).not.toContain('^k-');
    expect(t.karten[2]).toMatchObject({ id: 'k-g7h8i9', zurueckgezogen: true, frage: 'Alte Karte?' });
  });

  it('merkt sich die Zeile der F-Zeile', () => {
    const lines = fixture.split('\n');
    expect(lines[t.karten[0]!.zeile - 1]).toMatch(/^\*\*F:\*\* Was ist/);
  });

  it('liest die Mindmap als Baum', () => {
    expect(t.mindmap?.text).toBe('Ableitungen');
    expect(t.mindmap?.kinder.map((k) => k.text)).toEqual(['Regeln', 'Anwendungen']);
    expect(t.mindmap?.kinder[0]?.kinder).toHaveLength(2);
  });

  it('liest vier Übungen, eine pro Typ', () => {
    expect(t.uebungen.map((u) => u.typ)).toEqual(['eingabe', 'schritte', 'mc', 'offen']);
    expect(t.uebungen[0]).toMatchObject({ id: 'u-aaa111', loesung: 12, toleranz: 0.01 });
    expect(t.uebungen[1]!.schritte).toHaveLength(3);
    expect(t.uebungen[2]!.richtig).toEqual([0, 1]);
    expect(t.uebungen[3]!.musterloesung).toMatch(/waagrecht/);
  });

  it('liest die Zusammenfassung roh', () => {
    expect(t.zusammenfassung).toBe("Die Ableitung $f'(x)$ gibt die Steigung von $f$ an der Stelle $x$ an.");
  });

  it('parst CRLF mit BOM identisch', () => {
    expect(parseTopic('\uFEFF' + fixture.replace(/\n/g, '\r\n'))).toEqual(t);
  });

  it('meldet Karte ohne Antwort und behält die übrigen', () => {
    const broken = fixture.replace(String.raw`**A:** $n \cdot x^{n-1}$ ^k-a1b2c3`, 'keine Antwort ^k-a1b2c3');
    const r = parseTopic(broken);
    expect(r.fehler[0]).toMatch(/Antwort fehlt/);
    expect(r.karten).toHaveLength(2);
  });

  it('meldet ungültiges YAML in einer Übung und lässt sie aus', () => {
    const broken = fixture.replace('richtig: [0, 1]', 'richtig: [0, 1');
    const r = parseTopic(broken);
    expect(r.fehler).toHaveLength(1);
    expect(r.uebungen).toHaveLength(3);
  });

  it('meldet fehlendes typabhängiges Pflichtfeld', () => {
    const broken = fixture.replace('loesung: 12\n', '');
    const r = parseTopic(broken);
    expect(r.fehler[0]).toMatch(/loesung/);
    expect(r.uebungen).toHaveLength(3);
  });

  it('Karte ohne ID hat id null und keinen Fehler', () => {
    const r = parseTopic(fixture.replace(' ^k-a1b2c3', ''));
    expect(r.karten[0]!.id).toBeNull();
    expect(r.fehler).toEqual([]);
  });

  it('meldet fehlende Pflichtfelder im Frontmatter', () => {
    const r = parseTopic(fixture.replace('titel: Ableitungen\n', ''));
    expect(r.fehler).toContain('Pflichtfeld titel fehlt');
  });

  it('ohne Mindmap-Abschnitt ist mindmap null', () => {
    const r = parseTopic(fixture.replace(/## Mindmap[\s\S]*?(?=## Lernkarten)/, ''));
    expect(r.mindmap).toBeNull();
  });
});
