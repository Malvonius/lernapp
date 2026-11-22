import { describe, expect, it } from 'vitest';
import { normalize, sections, splitFrontmatter } from '../../src/format/markdown';

describe('normalize', () => {
  it('entfernt BOM und wandelt CRLF in LF', () => {
    expect(normalize('﻿a\r\nb')).toBe('a\nb');
  });
});

describe('splitFrontmatter', () => {
  it('trennt YAML-Kopf und Text und liefert die Startzeile des Texts', () => {
    const r = splitFrontmatter('---\nid: x\n---\n# T\n');
    expect(r.data.id).toBe('x');
    expect(r.body).toBe('# T\n');
    expect(r.bodyStartLine).toBe(4);
  });
  it('ohne Frontmatter ist data leer und der Text beginnt in Zeile 1', () => {
    const r = splitFrontmatter('# T\n');
    expect(r.data).toEqual({});
    expect(r.bodyStartLine).toBe(1);
  });
});

describe('sections', () => {
  it('teilt den Text an ## Überschriften', () => {
    const s = sections('# T\n## Zusammenfassung\nText\n## Lernkarten\nK', 1);
    expect([...s.keys()]).toEqual(['Zusammenfassung', 'Lernkarten']);
    expect(s.get('Zusammenfassung')!.text).toBe('Text');
    expect(s.get('Lernkarten')!.startLine).toBe(5);
  });
});
