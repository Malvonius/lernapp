import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ensureIds, findDuplicateIds, newId } from '../../src/format/ids';
import { parseTopic } from '../../src/format/parseTopic';

const fixture = readFileSync(
  fileURLToPath(new URL('../fixtures/lernstoff-mini/Mathe/01 Analysis/Ableitungen.md', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');
const withoutIds = fixture.replace(' ^k-a1b2c3', '').replace(' ^k-d4e5f6', '').replace('id: u-bbb222\n', '');

describe('newId', () => {
  it('erzeugt IDs im Format und nie eine vergebene', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 1000; i++) taken.add(newId('k', taken));
    expect(taken.size).toBe(1000);
    const id = newId('k', taken);
    expect(taken.has(id)).toBe(false);
    expect(id).toMatch(/^k-[a-z0-9]{6}$/);
    expect(newId('u', new Set())).toMatch(/^u-[a-z0-9]{6}$/);
  });
});

describe('ensureIds', () => {
  it('ergänzt fehlende Karten- und Übungs-IDs und ändert sonst nichts', () => {
    const r = ensureIds(withoutIds, new Set());
    expect(r.added).toHaveLength(3);
    const t = parseTopic(r.text);
    expect(r.added).toContain(t.karten[0]!.id);
    expect(t.karten.every((k) => k.id)).toBe(true);
    expect(t.uebungen.every((u) => u.id)).toBe(true);
    expect(t.karten[1]!.antwort).toBe(parseTopic(fixture).karten[1]!.antwort);
    const stripped = r.text.replace(/ \^k-[a-z0-9]{6}/g, '').replace(/\nid: u-[a-z0-9]{6}/g, '');
    const origStripped = withoutIds.replace(/ \^k-[a-z0-9]{6}/g, '').replace(/\nid: u-[a-z0-9]{6}/g, '');
    expect(stripped).toBe(origStripped);
  });

  it('ist idempotent', () => {
    const once = ensureIds(withoutIds, new Set());
    const twice = ensureIds(once.text, new Set());
    expect(twice.added).toEqual([]);
    expect(twice.text).toBe(once.text);
  });

  it('lässt eine Datei mit allen IDs byte-gleich', () => {
    expect(ensureIds(fixture, new Set()).text).toBe(fixture);
  });

  it('behält CRLF und BOM', () => {
    const crlf = '\uFEFF' + withoutIds.replace(/\n/g, '\r\n');
    const r = ensureIds(crlf, new Set());
    expect(r.added.length).toBe(3);
    expect(r.text.startsWith('\uFEFF')).toBe(true);
    expect(/[^\r]\n/.test(r.text)).toBe(false);
  });

  it('vergibt keine ID, die in taken steht, und trägt neue in taken ein', () => {
    const taken = new Set<string>();
    const r = ensureIds(withoutIds, taken);
    for (const id of r.added) expect(taken.has(id)).toBe(true);
  });
});

describe('findDuplicateIds', () => {
  it('findet dieselbe ID in zwei Themen und ensureIds ändert sie nicht', () => {
    const a = parseTopic(fixture);
    const b = parseTopic(fixture.replace('id: mathe-ableitungen', 'id: kopie'));
    const d = findDuplicateIds([{ pfad: 'a.md', topic: a }, { pfad: 'b.md', topic: b }]);
    expect(d.get('k-a1b2c3')).toHaveLength(2);
    expect(d.get('k-a1b2c3')![0]).toMatch(/^a\.md:\d+$/);
    expect(ensureIds(fixture, new Set(['k-a1b2c3'])).text).toBe(fixture);
  });

  it('meldet keine Duplikate bei eindeutigen IDs', () => {
    expect(findDuplicateIds([{ pfad: 'a.md', topic: parseTopic(fixture) }]).size).toBe(0);
  });
});
