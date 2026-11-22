import { normalize, sections, splitFrontmatter } from './markdown';
import type { Struktur, Subject, SubjectChapter } from './types';

const REQUIRED_FIELDS = ['id', 'name', 'kuerzel', 'farbe', 'struktur'] as const;
const STRUKTUREN: readonly Struktur[] = ['fest', 'vorlaeufig'];
const WIKILINK = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;

/** Liest eine Fach-Datei `<Fach>/<Fach>.md`. Wirft nie; Probleme landen in `fehler`. */
export function parseSubject(text: string): Subject {
  const fehler: string[] = [];
  const src = normalize(text);
  let data: Record<string, unknown> = {};
  let body = src;
  let bodyStartLine = 1;
  try {
    ({ data, body, bodyStartLine } = splitFrontmatter(src));
  } catch (e) {
    fehler.push(`Frontmatter ungültig: ${(e as Error).message.split('\n')[0]}`);
  }

  for (const f of REQUIRED_FIELDS) {
    if (data[f] === undefined || data[f] === null || data[f] === '') fehler.push(`Pflichtfeld ${f} fehlt`);
  }
  const farbe = data.farbe === undefined ? '' : String(data.farbe);
  if (farbe && !/^#[0-9a-fA-F]{6}$/.test(farbe)) fehler.push(`farbe muss #rrggbb sein, ist "${farbe}"`);
  const struktur = String(data.struktur ?? '') as Struktur;
  if (data.struktur !== undefined && !STRUKTUREN.includes(struktur)) {
    fehler.push(`struktur muss fest oder vorlaeufig sein, ist "${struktur}"`);
  }

  const kapitel: SubjectChapter[] = [];
  const sec = sections(body, bodyStartLine).get('Kapitel');
  if (!sec) fehler.push('Abschnitt ## Kapitel fehlt');
  else {
    sec.text.split('\n').forEach((line, i) => {
      const lineNo = sec.startLine + i;
      const top = /^[-*] (.+)$/.exec(line);
      if (top) {
        const ordner = (top[1] ?? '').trim();
        kapitel.push({ ordner, titel: ordner.replace(/^\d+\s+/, ''), themen: [] });
        return;
      }
      const sub = /^[ \t]+[-*] (.+)$/.exec(line);
      if (!sub) return;
      const link = WIKILINK.exec((sub[1] ?? '').trim());
      const chapter = kapitel[kapitel.length - 1];
      if (!link) fehler.push(`Zeile ${lineNo}: Thema muss [[Dateiname]] sein`);
      else if (!chapter) fehler.push(`Zeile ${lineNo}: Thema ohne Kapitel`);
      else {
        const datei = (link[1] ?? '').trim();
        chapter.themen.push({ datei, titel: (link[2] ?? datei).trim() });
      }
    });
  }

  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    kuerzel: String(data.kuerzel ?? ''),
    farbe,
    struktur,
    kapitel,
    fehler,
  };
}
