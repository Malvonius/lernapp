import { useEffect, useRef, useState } from 'react';
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

type MarkmapInstanz = { setOptions(o: { zoom: boolean; pan: boolean }): void; fit(): Promise<void>; destroy(): void };

/**
 * Interaktive Mindmap (markmap). Zoom/Verschieben (d3-zoom) ist erst nach „Zoomen und verschieben“ aktiv:
 * sonst schluckt die Mindmap am Handy jede Wischgeste und die Seite lässt sich nicht mehr scrollen.
 * Antippen zum Auf- und Zuklappen der Äste geht immer.
 */
export function Mindmap({ root }: { root: MindmapNode }) {
  const svg = useRef<SVGSVGElement>(null);
  const mmRef = useRef<MarkmapInstanz | null>(null);
  const [gesten, setGesten] = useState(false);
  const gestenRef = useRef(gesten);
  gestenRef.current = gesten;

  useEffect(() => {
    mmRef.current?.setOptions({ zoom: gesten, pan: gesten });
    if (!gesten) void mmRef.current?.fit().catch(() => undefined);
  }, [gesten]);

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
      const an = gestenRef.current;
      const mm = Markmap.create(el, { duration: 200, maxWidth: 220, zoom: an, pan: an, color: () => 'var(--fach, var(--c-accent))' }, baum);
      mmRef.current = mm;
      aufraeumen = () => {
        mmRef.current = null;
        mm.destroy();
      };
    })().catch(() => {
      /* Mindmap ist Zusatz; ein Fehler darf den Rest nicht stören */
    });
    return () => {
      abgebrochen = true;
      aufraeumen?.();
    };
  }, [root]);

  return (
    <div className="mindmap-rahmen">
      <svg ref={svg} className={gesten ? 'mindmap mindmap--aktiv' : 'mindmap'} role="img" aria-label={`Mindmap: ${root.text}`} />
      <button type="button" className="button button--quiet mindmap__gesten" aria-pressed={gesten} onClick={() => setGesten((g) => !g)}>
        Zoomen und verschieben
      </button>
    </div>
  );
}
