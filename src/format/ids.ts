import { parseTopic } from './parseTopic';
import type { Topic } from './types';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const RETIRED = '%%zurückgezogen%%';

/** Zufällige ID `k-xxxxxx` / `u-xxxxxx`, garantiert nicht in `taken`. */
export function newId(prefix: 'k' | 'u', taken: Set<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const id = `${prefix}-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Ergänzt fehlende Karten-IDs (` ^k-…` am Ende des letzten Inhalts der Karte) und
 * Übungs-IDs (`id: u-…` als erste YAML-Zeile). Ändert sonst nichts; BOM und
 * Zeilenenden (LF oder CRLF) bleiben erhalten. Neue IDs werden in `taken` eingetragen.
 */
export function ensureIds(text: string, taken: Set<string>): { text: string; added: string[] } {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const raw = bom ? text.slice(1) : text;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const topic = parseTopic(raw);

  for (const k of topic.karten) if (k.id) taken.add(k.id);
  for (const u of topic.uebungen) if (u.id) taken.add(u.id);

  // Karten-IDs werden an bestehende Zeilen angehängt (keine Verschiebung);
  // Übungs-IDs sind neue Zeilen und werden danach von unten nach oben eingefügt.
  const cardIds: string[] = [];
  for (const k of topic.karten) {
    if (k.id) continue;
    const last = lastContentLine(lines, k.zeile - 1);
    const id = newId('k', taken);
    taken.add(id);
    cardIds.push(id);
    lines[last] = `${(lines[last] ?? '').trimEnd()} ^${id}`;
  }
  const inserts: { at: number; id: string }[] = [];
  for (const u of topic.uebungen) {
    if (u.id) continue;
    const id = newId('u', taken);
    taken.add(id);
    inserts.push({ at: u.zeile, id }); // zeile = ```uebung-Zeile (1-basiert) → Index danach
  }
  for (const ins of inserts.sort((a, b) => b.at - a.at)) lines.splice(ins.at, 0, `id: ${ins.id}`);

  const added = [...cardIds, ...inserts.map((i) => i.id)];
  if (added.length === 0) return { text, added };
  return { text: bom + lines.join(eol), added };
}

/** Index (0-basiert) der letzten Inhaltszeile einer Karte, die bei `start` beginnt. */
function lastContentLine(lines: string[], start: number): number {
  let end = start + 1;
  while (end < lines.length && !/^\*\*F:\*\*/.test(lines[end] ?? '') && !/^## /.test(lines[end] ?? '')) end++;
  let last = end - 1;
  while (last > start && ((lines[last] ?? '').trim() === '' || (lines[last] ?? '').trim() === RETIRED)) last--;
  return last;
}

/** ID → Fundorte (`pfad:zeile`), nur IDs mit mehr als einem Vorkommen. */
export function findDuplicateIds(topics: { pfad: string; topic: Topic }[]): Map<string, string[]> {
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
