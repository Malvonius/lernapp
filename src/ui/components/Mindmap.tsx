import { useEffect, useRef } from 'react';
import type { MindmapNode } from '../../format/types';

/** Knotentext als reinen Text ausgeben: markmap-lib rendert Markdown mit html: true. */
function escapeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^([#*+-])/, '\\$1')
    .replace(/^(\d+)([.)])/, '$1\\$2');
}

/** Baum → Markdown-Liste (Eingabe für markmap). */
export function mindmapMarkdown(root: MindmapNode): string {
  const zeilen: string[] = [];
  const walk = (n: MindmapNode, tiefe: number) => {
    zeilen.push(`${'  '.repeat(tiefe)}- ${escapeText(n.text)}`);
    n.kinder.forEach((k) => walk(k, tiefe + 1));
  };
  walk(root, 0);
  return zeilen.join('\n');
}

/** Interaktive Mindmap (markmap). Zoom/Verschieben per Touch übernimmt markmap-view (d3-zoom). */
export function Mindmap({ root }: { root: MindmapNode }) {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svg.current;
    // jsdom (Tests) kennt die SVG-Geometrie-APIs nicht → markmap dort gar nicht erst laden
    if (!el || typeof (el as unknown as { getBBox?: unknown }).getBBox !== 'function') return;
    let abgebrochen = false;
    let aufraeumen: (() => void) | undefined;
    void (async () => {
      const [{ Transformer }, { Markmap }] = await Promise.all([import('markmap-lib'), import('markmap-view')]);
      if (abgebrochen) return;
      const { root: baum } = new Transformer().transform(mindmapMarkdown(root));
      const mm = Markmap.create(el, { duration: 200, maxWidth: 220, color: () => 'var(--fach, var(--c-accent))' }, baum);
      aufraeumen = () => mm.destroy();
    })().catch(() => {
      /* Mindmap ist Zusatz; ein Fehler darf den Rest nicht stören */
    });
    return () => {
      abgebrochen = true;
      aufraeumen?.();
    };
  }, [root]);

  return <svg ref={svg} className="mindmap" role="img" aria-label={`Mindmap: ${root.text}`} />;
}
