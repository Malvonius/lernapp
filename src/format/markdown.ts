import { parse as parseYaml } from 'yaml';

/** Entfernt ein BOM am Anfang und wandelt CRLF/CR in LF. */
export function normalize(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export interface FrontmatterSplit {
  data: Record<string, unknown>;
  body: string;
  /** 1-basierte Zeilennummer, in der `body` in der Originaldatei beginnt */
  bodyStartLine: number;
}

/**
 * Trennt einen YAML-Kopf (`---` … `---`) vom Text. Erwartet normalisierten Text.
 * Ungültiges YAML wirft einen Error; der Aufrufer meldet ihn als Fehler am Thema.
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!m) return { data: {}, body: text, bodyStartLine: 1 };
  const parsed: unknown = parseYaml(m[1] ?? '');
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const consumed = m[0];
  const lines = consumed.endsWith('\n') ? consumed.split('\n').length - 1 : consumed.split('\n').length;
  return { data, body: text.slice(consumed.length), bodyStartLine: lines + 1 };
}

export interface Section {
  text: string;
  /** 1-basierte Zeile der ersten Inhaltszeile nach der Überschrift */
  startLine: number;
}

/**
 * Teilt Text an `## `-Überschriften (außerhalb von Code-Blöcken).
 * Schlüssel = Überschrift ohne `## `, getrimmt. Führende Leerzeilen und Leerraum am Ende werden entfernt; startLine zeigt auf die erste nicht-leere Zeile.
 */
export function sections(body: string, startLine: number): Map<string, Section> {
  const out = new Map<string, Section>();
  const lines = body.split('\n');
  let current: { name: string; start: number; lines: string[] } | null = null;
  let inFence = false;
  const flush = () => {
    if (current && !out.has(current.name)) {
      let skip = 0;
      while (skip < current.lines.length && (current.lines[skip] ?? '').trim() === '') skip++;
      out.set(current.name, {
        text: current.lines.slice(skip).join('\n').trimEnd(),
        startLine: current.start + skip,
      });
    }
  };
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = !inFence && /^## (.+)$/.exec(line);
    if (h) {
      flush();
      current = { name: (h[1] ?? '').trim(), start: startLine + i + 1, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  });
  flush();
  return out;
}
