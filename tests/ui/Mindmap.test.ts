import { describe, expect, it } from 'vitest';
import { mindmapMarkdown } from '../../src/ui/components/Mindmap';

describe('mindmapMarkdown', () => {
  it('escaped rohes HTML: kein <img im Ergebnis', () => {
    const md = mindmapMarkdown({ text: '<img src=x onerror=alert(1)>', kinder: [] });
    expect(md).not.toContain('<img');
    expect(md).not.toContain('<');
    expect(md).toContain('&lt;img');
  });

  it('führende Markdown-Sonderzeichen bleiben Text', () => {
    const md = mindmapMarkdown({
      text: 'Wurzel',
      kinder: [
        { text: '# Titel', kinder: [] },
        { text: '1. Eins', kinder: [] },
        { text: '- Strich', kinder: [] },
        { text: '> Zitat', kinder: [] },
      ],
    });
    expect(md.split('\n')).toEqual(['- Wurzel', '  - \\# Titel', '  - 1\\. Eins', '  - \\- Strich', '  - &gt; Zitat']);
  });

  it('normale Knoten bleiben unverändert', () => {
    const md = mindmapMarkdown({ text: 'A', kinder: [{ text: 'Potenzregel $x^n$', kinder: [{ text: 'B', kinder: [] }] }] });
    expect(md).toBe('- A\n  - Potenzregel $x^n$\n    - B');
  });
});
