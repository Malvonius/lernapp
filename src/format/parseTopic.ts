import { parse as parseYaml } from 'yaml';
import { normalize, sections, splitFrontmatter } from './markdown';
import type { Card, Exercise, ExerciseType, MindmapNode, Topic } from './types';

const CARD_START = /^\*\*F:\*\*/;
const ANSWER_START = /^\*\*A:\*\*/;
const RETIRED = '%%zurückgezogen%%';
const CARD_ID = /\s*\^(k-[a-z0-9]{6})\s*$/;
const EXERCISE_TYPES: readonly ExerciseType[] = ['eingabe', 'schritte', 'mc', 'offen'];
const REQUIRED_FIELDS = ['id', 'fach', 'kapitel', 'titel', 'quellen', 'stand'] as const;

/** Liest eine Themen-Datei. Wirft nie; Probleme landen in `fehler`. */
export function parseTopic(text: string): Topic {
  const fehler: string[] = [];
  const src = normalize(text);

  let data: Record<string, unknown> = {};
  let body = src;
  let bodyStartLine = 1;
  try {
    ({ data, body, bodyStartLine } = splitFrontmatter(src));
  } catch (e) {
    fehler.push(`Frontmatter ungültig: ${(e as Error).message.split('\n')[0]}`);
    body = src.replace(/^---\n[\s\S]*?\n---\n?/, '');
  }

  for (const f of REQUIRED_FIELDS) {
    if (data[f] === undefined || data[f] === null || data[f] === '') fehler.push(`Pflichtfeld ${f} fehlt`);
  }
  const quellen = Array.isArray(data.quellen) ? data.quellen.map(String) : [];
  if (data.quellen !== undefined && !Array.isArray(data.quellen)) fehler.push('quellen muss eine Liste sein');

  const secs = sections(body, bodyStartLine);
  const karten = secs.has('Lernkarten') ? parseCards(secs.get('Lernkarten')!, fehler) : [];
  const uebungen = secs.has('Übungen') ? parseExercises(secs.get('Übungen')!, fehler) : [];
  const mindmap = secs.has('Mindmap') ? parseMindmap(secs.get('Mindmap')!.text) : null;

  return {
    id: str(data.id),
    fach: str(data.fach),
    kapitel: str(data.kapitel),
    titel: str(data.titel),
    quellen,
    stand: str(data.stand),
    zusammenfassung: secs.get('Zusammenfassung')?.text ?? '',
    mindmap,
    karten,
    uebungen,
    fehler,
  };
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

interface Block {
  lines: string[];
  start: number;
  retired: boolean;
}

function parseCards(sec: { text: string; startLine: number }, fehler: string[]): Card[] {
  const lines = sec.text.split('\n');
  const blocks: Block[] = [];
  let current: Block | null = null;
  let retireNext = false;

  lines.forEach((line, i) => {
    const lineNo = sec.startLine + i;
    if (line.trim() === RETIRED) {
      // Marker vor der nächsten F-Zeile (nur Leerzeilen dazwischen) gehört zur nächsten Karte.
      const next = lines.slice(i + 1).find((l) => l.trim() !== '');
      if (next !== undefined && CARD_START.test(next)) retireNext = true;
      else if (current) current.retired = true;
      return;
    }
    if (CARD_START.test(line)) {
      current = { lines: [line], start: lineNo, retired: retireNext };
      blocks.push(current);
      retireNext = false;
      return;
    }
    current?.lines.push(line);
  });

  const cards: Card[] = [];
  for (const b of blocks) {
    let blockLines = b.lines.map((l) => (l.includes(RETIRED) ? l.replace(RETIRED, '') : l));
    if (b.lines.some((l) => l.includes(RETIRED))) b.retired = true;
    while (blockLines.length && (blockLines[blockLines.length - 1] ?? '').trim() === '') blockLines.pop();

    let id: string | null = null;
    const lastIdx = blockLines.length - 1;
    const m = CARD_ID.exec(blockLines[lastIdx] ?? '');
    if (m) {
      id = m[1] ?? null;
      blockLines = [...blockLines.slice(0, lastIdx), (blockLines[lastIdx] ?? '').replace(CARD_ID, '')];
    }

    const aIdx = blockLines.findIndex((l) => ANSWER_START.test(l));
    if (aIdx < 0) {
      fehler.push(`Karte Zeile ${b.start}: Antwort fehlt`);
      continue;
    }
    const frage = [(blockLines[0] ?? '').replace(CARD_START, ''), ...blockLines.slice(1, aIdx)].join('\n').trim();
    const antwort = [(blockLines[aIdx] ?? '').replace(ANSWER_START, ''), ...blockLines.slice(aIdx + 1)].join('\n').trim();
    if (!frage) {
      fehler.push(`Karte Zeile ${b.start}: Frage fehlt`);
      continue;
    }
    cards.push({ id, frage, antwort, zurueckgezogen: b.retired, zeile: b.start });
  }
  return cards;
}

function parseExercises(sec: { text: string; startLine: number }, fehler: string[]): Exercise[] {
  const lines = sec.text.split('\n');
  const out: Exercise[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^```uebung\s*$/.test(lines[i] ?? '')) continue;
    const start = sec.startLine + i;
    const end = lines.findIndex((l, j) => j > i && /^```\s*$/.test(l));
    if (end < 0) {
      fehler.push(`Übung Zeile ${start}: Block nicht geschlossen`);
      break;
    }
    const yamlText = lines.slice(i + 1, end).join('\n');
    i = end;
    let raw: unknown;
    try {
      raw = parseYaml(yamlText);
    } catch (e) {
      fehler.push(`Übung Zeile ${start}: YAML ungültig (${(e as Error).message.split('\n')[0]})`);
      continue;
    }
    const ex = toExercise(raw, start);
    if (typeof ex === 'string') fehler.push(`Übung Zeile ${start}: ${ex}`);
    else out.push(ex);
  }
  return out;
}

/** Baut eine Übung oder liefert eine Fehlermeldung. */
function toExercise(raw: unknown, zeile: number): Exercise | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Block ist kein YAML-Objekt';
  const r = raw as Record<string, unknown>;
  const typ = r.typ as ExerciseType;
  if (!EXERCISE_TYPES.includes(typ)) return `typ muss einer von ${EXERCISE_TYPES.join(', ')} sein`;
  if (typeof r.frage !== 'string' || !r.frage.trim()) return 'frage fehlt';
  const id = typeof r.id === 'string' && r.id ? r.id : null;
  const ex: Exercise = { id, typ, frage: r.frage, zurueckgezogen: r.status === 'zurückgezogen', zeile };

  switch (typ) {
    case 'eingabe':
      if (typeof r.loesung !== 'number' && typeof r.loesung !== 'string') return 'loesung fehlt';
      ex.loesung = r.loesung;
      if (r.toleranz !== undefined) {
        if (typeof r.toleranz !== 'number' || r.toleranz < 0) return 'toleranz muss eine Zahl ≥ 0 sein';
        ex.toleranz = r.toleranz;
      }
      break;
    case 'schritte':
      if (!isStringList(r.schritte)) return 'schritte fehlt (Liste von Texten)';
      ex.schritte = r.schritte;
      break;
    case 'mc': {
      if (!isStringList(r.optionen) || r.optionen.length < 2) return 'optionen fehlt (mindestens 2)';
      const opts = r.optionen;
      if (
        !Array.isArray(r.richtig) || r.richtig.length === 0 ||
        !r.richtig.every((n) => Number.isInteger(n) && n >= 0 && n < opts.length)
      ) return 'richtig fehlt oder zeigt auf keine Option';
      ex.optionen = opts;
      ex.richtig = r.richtig as number[];
      break;
    }
    case 'offen':
      if (typeof r.musterloesung !== 'string' || !r.musterloesung.trim()) return 'musterloesung fehlt';
      ex.musterloesung = r.musterloesung;
      break;
  }
  return ex;
}

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' || typeof x === 'number');
}

/** Verschachtelte `- `-Liste → Baum. Weitere Elemente auf oberster Ebene werden Kinder der Wurzel. */
function parseMindmap(text: string): MindmapNode | null {
  const items: { level: number; text: string }[] = [];
  for (const line of text.split('\n')) {
    const m = /^([ \t]*)[-*] (.+)$/.exec(line);
    if (!m) continue;
    const indent = m[1] ?? '';
    const level = (indent.match(/\t/g)?.length ?? 0) + Math.floor(indent.replace(/\t/g, '').length / 2);
    items.push({ level, text: (m[2] ?? '').trim() });
  }
  const first = items[0];
  if (!first) return null;
  const root: MindmapNode = { text: first.text, kinder: [] };
  const stack: { level: number; node: MindmapNode }[] = [{ level: first.level, node: root }];
  for (const it of items.slice(1)) {
    const node: MindmapNode = { text: it.text, kinder: [] };
    while (stack.length > 1 && stack[stack.length - 1]!.level >= it.level) stack.pop();
    const parent = it.level <= first.level ? root : stack[stack.length - 1]!.node;
    parent.kinder.push(node);
    stack.push({ level: Math.max(it.level, first.level + 1), node });
  }
  return root;
}
