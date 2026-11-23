import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseProbe } from '../../src/format/parseProbe';
import { parseTopic } from '../../src/format/parseTopic';

const fixture = readFileSync(
  fileURLToPath(new URL('../fixtures/lernstoff-mini/Mathe/_proben/Probe Ableitungen.md', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

const kopf = (extra = '') =>
  `---\nid: p-1\nfach: mathe\ntitel: Probe\ndauer_min: 30\nquellen: []\nstand: 2026-11-23\n${extra}---\n`;
const aufgabe = (felder: string) => `\n\`\`\`uebung\nid: u-x00001\ntyp: eingabe\nfrage: "1+1?"\nloesung: 2\n${felder}\`\`\`\n`;

describe('parseProbe', () => {
  const p = parseProbe(fixture);

  it('liest das Frontmatter', () => {
    expect(p).toMatchObject({
      id: 'mathe-probe-ableitungen-1',
      fach: 'mathe',
      titel: 'Probe-Schularbeit Ableitungen',
      dauerMin: 20,
      quellen: ['[[_quellen/Mathe/Beispiel.docx]]'],
      stand: '2026-11-23',
    });
    expect(p.fehler).toEqual([]);
  });

  it('liest den Notenschlüssel', () => {
    expect(p.notenschluessel).toEqual([
      { note: 1, abProzent: 88 },
      { note: 2, abProzent: 75 },
      { note: 3, abProzent: 62 },
      { note: 4, abProzent: 50 },
      { note: 5, abProzent: 0 },
    ]);
  });

  it('liest Hinweise und Aufgaben in Datei-Reihenfolge mit Punkten', () => {
    expect(p.hinweise).toMatch(/^Erlaubt: Formelsammlung/);
    expect(p.aufgaben.map((a) => [a.id, a.typ, a.punkte])).toEqual([
      ['u-pr0001', 'eingabe', 4],
      ['u-pr0002', 'mc', 3],
      ['u-pr0003', 'offen', 5],
    ]);
    expect(p.aufgaben[1]!.richtig).toEqual([0, 1]);
    expect(p.aufgaben[2]!.musterloesung).toMatch(/Tiefpunkt/);
  });

  it('parst CRLF mit BOM identisch', () => {
    expect(parseProbe('﻿' + fixture.replace(/\n/g, '\r\n'))).toEqual(p);
  });

  it('ohne Notenschlüssel: null und kein Fehler; Hinweise optional', () => {
    const r = parseProbe(`${kopf()}## Aufgaben\n${aufgabe('punkte: 2\n')}`);
    expect(r.fehler).toEqual([]);
    expect(r.notenschluessel).toBeNull();
    expect(r.hinweise).toBe('');
    expect(r.aufgaben).toHaveLength(1);
  });

  it('meldet fehlende Pflichtfelder', () => {
    const r = parseProbe('---\nid: p-1\n---\n## Aufgaben\n');
    for (const f of ['fach', 'titel', 'dauer_min', 'quellen', 'stand']) expect(r.fehler.join('\n')).toContain(`Pflichtfeld ${f} fehlt`);
  });

  it.each(['0', '-5', 'zehn'])('meldet ungültige dauer_min %s', (d) => {
    const r = parseProbe(`${kopf().replace('dauer_min: 30', `dauer_min: ${d}`)}## Aufgaben\n${aufgabe('punkte: 1\n')}`);
    expect(r.fehler.join()).toMatch(/dauer_min/);
  });

  it('meldet fehlende und ungültige Punkte', () => {
    const ohne = parseProbe(`${kopf()}## Aufgaben\n${aufgabe('')}`);
    expect(ohne.fehler.join()).toMatch(/punkte fehlt/);
    for (const wert of ['0', '-1', '"viel"']) {
      const r = parseProbe(`${kopf()}## Aufgaben\n${aufgabe(`punkte: ${wert}\n`)}`);
      expect(r.fehler.join(), wert).toMatch(/punkte/);
    }
  });

  it('meldet Notenschlüssel, der nicht absteigend ist oder außerhalb 0–100 liegt', () => {
    const fall = (liste: string) =>
      parseProbe(`${kopf(`notenschluessel:\n${liste}`)}## Aufgaben\n${aufgabe('punkte: 1\n')}`);
    expect(fall('  - { note: 1, ab_prozent: 70 }\n  - { note: 2, ab_prozent: 80 }\n').fehler.join()).toMatch(/Notenschlüssel/);
    expect(fall('  - { note: 1, ab_prozent: 120 }\n').fehler.join()).toMatch(/Notenschlüssel/);
    expect(fall('  - { note: 1, ab_prozent: -1 }\n').fehler.join()).toMatch(/Notenschlüssel/);
    expect(fall('  - { note: 7, ab_prozent: 50 }\n').fehler.join()).toMatch(/Notenschlüssel/);
    expect(fall('  - { note: 2, ab_prozent: 80 }\n  - { note: 1, ab_prozent: 60 }\n').fehler.join()).toMatch(/Notenschlüssel/);
    expect(fall('  kaputt\n').fehler.join()).toMatch(/Notenschlüssel/);
  });

  it('wirft nie, auch nicht bei kaputtem Frontmatter oder leerem Text', () => {
    expect(() => parseProbe('')).not.toThrow();
    const r = parseProbe('---\nid: [kaputt\n---\n## Aufgaben\n');
    expect(r.fehler[0]).toMatch(/Frontmatter ungültig/);
  });

  it('meldet eine Probe ohne Aufgaben', () => {
    expect(parseProbe(`${kopf()}## Hinweise\nnur Text\n`).fehler.join()).toMatch(/Aufgaben/);
  });

  it('Themen-Übungen dürfen weiterhin ohne punkte sein, ungültige punkte werden gemeldet', () => {
    const t = `---\nid: t\nfach: mathe\nkapitel: 01 Analysis\ntitel: T\nquellen: []\nstand: 2026-11-23\n---\n## Übungen\n`;
    expect(parseTopic(t + aufgabe('')).fehler).toEqual([]);
    expect(parseTopic(t + aufgabe('punkte: 2\n')).uebungen[0]!.punkte).toBe(2);
    expect(parseTopic(t + aufgabe('punkte: 0\n')).fehler.join()).toMatch(/punkte/);
  });
});
