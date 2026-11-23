import { parseProbe } from './parseProbe';
import { parseTopic } from './parseTopic';
import type { Card, Exercise } from './types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Zeilen, an die keine ID angehängt werden darf (sonst bricht die Darstellung in Obsidian). */
const BLOCK_END = /^\s*(```+|~~~+|\$\$|\|.*\|)\s*$/;

/** Zufällige ID `k-xxxxxx` / `u-xxxxxx`, garantiert nicht in `taken`. */
export function newId(prefix: 'k' | 'u', taken: Set<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const id = `${prefix}-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
    if (!taken.has(id)) return id;
  }
}

type Edit =
  | { line: number; kind: 'append'; id: string } // ` ^id` an Zeile anhängen
  | { line: number; kind: 'after'; text: string } // neue Zeile nach `line` einfügen
  | { line: number; kind: 'replace'; text: string };

/**
 * Ergänzt fehlende Karten-IDs (` ^k-…` am Ende des letzten Inhalts der Karte, bzw. in einer
 * eigenen Zeile nach einem Code-, Formel- oder Tabellenblock) und Übungs-IDs (`id: u-…`).
 * Ändert sonst nichts; BOM und Zeilenenden bleiben erhalten. Neue IDs werden in `taken`
 * eingetragen. Dateien mit kaputtem Frontmatter werden nicht angefasst.
 * `art: 'probe'` liest die Datei als Probe-Schularbeit (Aufgaben statt Übungen, keine Karten).
 */
export function ensureIds(text: string, taken: Set<string>, art: 'thema' | 'probe' = 'thema'): { text: string; added: string[] } {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const raw = bom ? text.slice(1) : text;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r\n|\r|\n/);
  const topic = art === 'probe' ? probeInhalt(parseProbe(raw)) : parseTopic(raw);
  if (topic.fehler.some((f) => f.startsWith('Frontmatter'))) return { text, added: [] };

  for (const k of topic.karten) if (k.id) taken.add(k.id);
  for (const u of topic.uebungen) if (u.id) taken.add(u.id);

  const added: string[] = [];
  const edits: Edit[] = [];
  for (const k of topic.karten) {
    if (k.id) continue;
    const id = newId('k', taken);
    taken.add(id);
    added.push(id);
    const idx = k.ende - 1;
    if (BLOCK_END.test(lines[idx] ?? '')) edits.push({ line: idx, kind: 'after', text: `^${id}` });
    else edits.push({ line: idx, kind: 'append', id });
  }
  for (const u of topic.uebungen) {
    if (u.id) continue;
    const id = newId('u', taken);
    taken.add(id);
    added.push(id);
    if (u.idZeile !== null) edits.push({ line: u.idZeile - 1, kind: 'replace', text: `id: ${id}` });
    else edits.push({ line: u.zeile - 1, kind: 'after', text: `id: ${id}` });
  }
  if (added.length === 0) return { text, added };

  // Von unten nach oben anwenden, damit die Zeilennummern gültig bleiben.
  for (const e of edits.sort((a, b) => b.line - a.line)) {
    if (e.kind === 'append') lines[e.line] = `${(lines[e.line] ?? '').trimEnd()} ^${e.id}`;
    else if (e.kind === 'replace') lines[e.line] = e.text;
    else lines.splice(e.line + 1, 0, e.text);
  }
  return { text: bom + lines.join(eol), added };
}

/** Karten und Übungen einer Datei (Thema oder Probe), soweit sie IDs tragen können. */
export interface IdInhalt {
  karten: Card[];
  uebungen: Exercise[];
}

/** Probe als ID-Inhalt (für ensureIds und findDuplicateIds): ihre Aufgaben zählen als Übungen. */
export function probeInhalt(p: ReturnType<typeof parseProbe>): IdInhalt & { fehler: string[] } {
  return { karten: [], uebungen: p.aufgaben, fehler: p.fehler };
}

/** ID → Fundorte (`pfad:zeile`), nur IDs mit mehr als einem Vorkommen. */
export function findDuplicateIds(topics: { pfad: string; topic: IdInhalt }[]): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  for (const { pfad, topic } of topics) {
    for (const item of [...topic.karten, ...topic.uebungen]) {
      if (!item.id) continue;
      const list = seen.get(item.id) ?? [];
      list.push(`${pfad}:${item.zeile}`);
      seen.set(item.id, list);
    }
  }
  return new Map([...seen].filter(([, v]) => v.length > 1));
}
