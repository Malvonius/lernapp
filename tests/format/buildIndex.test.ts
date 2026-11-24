import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/format/buildIndex';
import { gitBlobSha } from '../../src/format/gitHash';

const FIXTURE = fileURLToPath(new URL('../fixtures/lernstoff-mini', import.meta.url));
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lernstoff-'));
  cpSync(FIXTURE, root, { recursive: true });
});

const topicFile = (id: string, extra = '') => `---\nid: ${id}\nfach: mathe\nkapitel: 01 Analysis\ntitel: ${id}\nquellen: []\nstand: 2026-11-22\n---\n# ${id}\n\n## Lernkarten\n\n**F:** Frage?\n**A:** Antwort${extra}\n`;

describe('gitBlobSha', () => {
  it('entspricht git hash-object', () => {
    expect(gitBlobSha(new TextEncoder().encode('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('buildIndex', () => {
  it('zeigt Lücken, zählt nur aktive Karten und alle Übungen', async () => {
    const { index } = await buildIndex(root, { fix: false, now: new Date('2026-11-22T12:00:00Z') });
    expect(index.version).toBe(1);
    expect(index.erstellt).toBe('2026-11-22T12:00:00.000Z');
    const mathe = index.faecher.find((f) => f.id === 'mathe')!;
    expect(mathe.pfad).toBe('Mathe/Mathe.md');
    const analysis = mathe.kapitel[0]!;
    expect(analysis.themen.find((t) => t.titel === 'Kurvendiskussion')).toMatchObject({ pfad: null, hash: null, karten: 0 });
    expect(analysis.themen.find((t) => t.titel === 'Ableitungen')).toMatchObject({
      id: 'mathe-ableitungen', pfad: 'Mathe/01 Analysis/Ableitungen.md', karten: 2, uebungen: 4, hatMindmap: true,
    });
    expect(index.fehlerAnzahl).toBe(0);
  });

  it('findet Themen mit Umlauten, & und Leerzeichen im Pfad', async () => {
    const { index } = await buildIndex(root, { fix: false });
    const t = index.faecher[0]!.kapitel[1]!.themen[0]!;
    expect(t).toMatchObject({ titel: 'Taylorreihen und DG', pfad: 'Mathe/02 Reihen & Differentialgleichungen/Taylor & DG.md', karten: 1 });
    expect(t.hash).toBe(gitBlobSha(readFileSync(join(root, t.pfad!))));
  });

  it('legt Dateien ohne Listeneintrag unter nichtZugeordnet ab', async () => {
    writeFileSync(join(root, 'Mathe/01 Analysis/Integrale.md'), topicFile('integrale', ' ^k-i1i2i3'));
    const { index } = await buildIndex(root, { fix: false });
    expect(index.faecher[0]!.nichtZugeordnet.map((t) => t.pfad)).toEqual(['Mathe/01 Analysis/Integrale.md']);
  });

  it('zählt Rückfragen und ignoriert _-Ordner als Fächer', async () => {
    mkdirSync(join(root, '_rueckfrage'));
    writeFileSync(join(root, '_rueckfrage/2026-11-22-x.md'), 'Was ist das?');
    mkdirSync(join(root, '_quellen'));
    writeFileSync(join(root, '_quellen/_quellen.md'), '---\nid: q\n---\n');
    const { index } = await buildIndex(root, { fix: false });
    expect(index.rueckfragen).toBe(1);
    expect(index.faecher.map((f) => f.id)).toEqual(['mathe']);
  });

  it('ergänzt mit fix fehlende IDs und ist beim zweiten Lauf ruhig', async () => {
    writeFileSync(join(root, 'Mathe/01 Analysis/Kurvendiskussion.md'), topicFile('kurvendiskussion'));
    const first = await buildIndex(root, { fix: true });
    expect(first.changedFiles).toEqual(['Mathe/01 Analysis/Kurvendiskussion.md']);
    expect(readFileSync(join(root, 'Mathe/01 Analysis/Kurvendiskussion.md'), 'utf8')).toMatch(/\^k-[a-z0-9]{6}\n$/);
    const second = await buildIndex(root, { fix: true });
    expect(second.changedFiles).toEqual([]);
  });

  it('ohne fix werden keine Dateien geändert', async () => {
    const p = join(root, 'Mathe/01 Analysis/Kurvendiskussion.md');
    writeFileSync(p, topicFile('kurvendiskussion'));
    const r = await buildIndex(root, { fix: false });
    expect(r.changedFiles).toEqual([]);
    expect(readFileSync(p, 'utf8')).toBe(topicFile('kurvendiskussion'));
  });

  it('meldet kaputte Datei und doppelte IDs, Index bleibt vollständig', async () => {
    writeFileSync(join(root, 'Mathe/01 Analysis/Kurvendiskussion.md'), topicFile('kurvendiskussion', ' ^k-a1b2c3'));
    writeFileSync(join(root, 'Mathe/01 Analysis/Integrale.md'), '---\nid: kaputt\n---\n## Lernkarten\n**F:** ohne Antwort\n');
    const { index } = await buildIndex(root, { fix: false });
    expect(index.fehlerAnzahl).toBeGreaterThanOrEqual(3);
    const themen = index.faecher[0]!.kapitel[0]!.themen;
    expect(themen.find((t) => t.titel === 'Ableitungen')!.fehler.join()).toMatch(/k-a1b2c3.*doppelt/);
    expect(themen.find((t) => t.titel === 'Kurvendiskussion')!.karten).toBe(1);
    expect(index.faecher[0]!.nichtZugeordnet[0]!.fehler.length).toBeGreaterThan(0);
    expect(index.faecher[0]!.kapitel[1]!.themen[0]!.karten).toBe(1);
  });
});

const probeFile = (titel: string, aufgaben: string, extra = '') =>
  `---\nid: p-${titel.toLowerCase()}\nfach: mathe\ntitel: ${titel}\ndauer_min: 30\nquellen: []\nstand: 2026-11-23\n${extra}---\n## Aufgaben\n${aufgaben}`;
const probeAufgabe = (id: string | null, punkte = 'punkte: 2\n') =>
  `\n\`\`\`uebung\n${id ? `id: ${id}\n` : ''}typ: eingabe\nfrage: "1+1?"\nloesung: 2\n${punkte}\`\`\`\n`;

describe('buildIndex: Proben', () => {
  it('liest <Fach>/_proben/*.md mit Aufgaben, Punkten und Dauer', async () => {
    const { index } = await buildIndex(root, { fix: false });
    const mathe = index.faecher[0]!;
    expect(mathe.proben).toHaveLength(1);
    const p = mathe.proben[0]!;
    expect(p).toMatchObject({
      id: 'mathe-probe-ableitungen-1',
      titel: 'Probe-Schularbeit Differentialrechnung',
      pfad: 'Mathe/_proben/Probe Ableitungen.md',
      aufgaben: 3,
      punkte: 12,
      dauerMin: 20,
      fehler: [],
    });
    expect(p.hash).toBe(gitBlobSha(readFileSync(join(root, p.pfad))));
    expect(index.fehlerAnzahl).toBe(0);
    // _proben ist kein Kapitel
    expect(mathe.nichtZugeordnet).toEqual([]);
  });

  it('sortiert Proben nach Titel und zählt ihre Fehler mit', async () => {
    writeFileSync(join(root, 'Mathe/_proben/b.md'), probeFile('Zweite', probeAufgabe('u-zz0001')));
    writeFileSync(join(root, 'Mathe/_proben/c.md'), probeFile('Andere', probeAufgabe('u-zz0002', '')));
    const { index } = await buildIndex(root, { fix: false });
    const proben = index.faecher[0]!.proben;
    expect(proben.map((p) => p.titel)).toEqual(['Andere', 'Probe-Schularbeit Differentialrechnung', 'Zweite']);
    expect(proben[0]!.fehler.join()).toMatch(/punkte fehlt/);
    expect(index.fehlerAnzahl).toBe(1);
  });

  it('Fach ohne _proben-Ordner hat eine leere Liste', async () => {
    mkdirSync(join(root, 'Physik'));
    writeFileSync(join(root, 'Physik/Physik.md'), '---\nid: physik\nname: Physik\nkuerzel: PH\nfarbe: "#336699"\nstruktur: fest\n---\n## Kapitel\n');
    const { index } = await buildIndex(root, { fix: false });
    expect(index.faecher.find((f) => f.id === 'physik')!.proben).toEqual([]);
  });

  it('ergänzt mit fix fehlende Aufgaben-IDs in Proben, zweiter Lauf ist ruhig', async () => {
    const p = join(root, 'Mathe/_proben/neu.md');
    writeFileSync(p, probeFile('Neu', probeAufgabe(null)));
    const first = await buildIndex(root, { fix: true });
    expect(first.changedFiles).toEqual(['Mathe/_proben/neu.md']);
    expect(readFileSync(p, 'utf8')).toMatch(/```uebung\nid: u-[a-z0-9]{6}\n/);
    expect(first.index.faecher[0]!.proben.find((x) => x.titel === 'Neu')!.fehler).toEqual([]);
    const second = await buildIndex(root, { fix: true });
    expect(second.changedFiles).toEqual([]);
  });

  it('meldet doppelte IDs zwischen Thema und Probe', async () => {
    writeFileSync(join(root, 'Mathe/_proben/dup.md'), probeFile('Dup', probeAufgabe('u-aaa111')));
    const { index } = await buildIndex(root, { fix: false });
    const mathe = index.faecher[0]!;
    expect(mathe.proben.find((x) => x.titel === 'Dup')!.fehler.join()).toMatch(/u-aaa111.*doppelt/);
    expect(mathe.kapitel[0]!.themen.find((t) => t.titel === 'Ableitungen')!.fehler.join()).toMatch(/u-aaa111.*doppelt/);
  });
});

describe('CLI build-index', () => {
  it('schreibt index.json und endet mit 0 ohne Fehler', () => {
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-index.ts', root], { stdio: 'pipe' });
    const idx = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
    expect(idx.version).toBe(1);
  });

  it('endet mit 1 bei Fehlern und schreibt index.json trotzdem', () => {
    writeFileSync(join(root, 'Mathe/01 Analysis/Integrale.md'), '---\nid: kaputt\n---\n');
    let code = 0;
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-index.ts', root], { stdio: 'pipe' });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    expect(code).toBe(1);
    expect(JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')).fehlerAnzahl).toBeGreaterThan(0);
  });
});

describe('buildIndex: doppelte Proben-IDs', () => {
  it('zwei Proben mit derselben id: Fehler „Probe-ID doppelt“ an beiden', async () => {
    const zweite = readFileSync(join(root, 'Mathe/_proben/Probe Ableitungen.md'), 'utf8')
      .replace('titel: Probe-Schularbeit Differentialrechnung', 'titel: Kopie')
      .replace(/u-pr000(\d)/g, 'u-kp000$1');
    writeFileSync(join(root, 'Mathe/_proben/Kopie.md'), zweite);
    const { index } = await buildIndex(root, { fix: false });
    const proben = index.faecher[0]!.proben;
    expect(proben).toHaveLength(2);
    for (const p of proben) expect(p.fehler.join()).toMatch(/Probe-ID mathe-probe-ableitungen-1 doppelt \(.*Kopie\.md.*Probe Ableitungen\.md|Probe-ID mathe-probe-ableitungen-1 doppelt \(.*Probe Ableitungen\.md.*Kopie\.md/);
    expect(index.fehlerAnzahl).toBe(2);
  });

  it('Probe-id gleich einer Themen-id: Fehler an Probe und Thema', async () => {
    writeFileSync(join(root, 'Mathe/_proben/x.md'), probeFile('X', probeAufgabe('u-xx0001')).replace('id: p-x', 'id: mathe-ableitungen'));
    const { index } = await buildIndex(root, { fix: false });
    const mathe = index.faecher[0]!;
    expect(mathe.proben.find((p) => p.titel === 'X')!.fehler.join()).toMatch(/Probe-ID mathe-ableitungen doppelt/);
    expect(mathe.kapitel[0]!.themen.find((t) => t.titel === 'Ableitungen')!.fehler.join()).toMatch(/Probe-ID mathe-ableitungen doppelt/);
  });
});
