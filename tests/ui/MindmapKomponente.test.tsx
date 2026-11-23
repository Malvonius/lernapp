import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Mindmap } from '../../src/ui/components/Mindmap';

const root = { text: 'Ableitungen', kinder: [{ text: 'Potenzregel', kinder: [] }] };

describe('Mindmap (Gesten)', () => {
  it('übernimmt Touch-Gesten erst nach „Zoomen und verschieben“, damit die Seite am Handy scrollbar bleibt', () => {
    render(<Mindmap root={root} />);
    const bild = screen.getByRole('img', { name: 'Mindmap: Ableitungen' });
    const knopf = screen.getByRole('button', { name: 'Zoomen und verschieben' });
    expect(knopf).toHaveAttribute('aria-pressed', 'false');
    expect(bild).not.toHaveClass('mindmap--aktiv');
    fireEvent.click(knopf);
    expect(knopf).toHaveAttribute('aria-pressed', 'true');
    expect(bild).toHaveClass('mindmap--aktiv');
    fireEvent.click(knopf);
    expect(knopf).toHaveAttribute('aria-pressed', 'false');
    expect(bild).not.toHaveClass('mindmap--aktiv');
  });
});
