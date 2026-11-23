import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AskBobButton } from '../../src/ui/components/AskBobButton';

const ctx = { fach: 'Mathe', thema: 'Ableitungen', zusammenfassung: 'Steigung.' };

afterEach(() => vi.unstubAllGlobals());

const oeffnen = () => fireEvent.click(screen.getByRole('button', { name: 'Frag Bob' }));

describe('AskBobButton', () => {
  it('zeigt erst nur den Knopf; das Feld kommt nach dem Klick, Übergabe ist ohne Frage gesperrt', () => {
    render(<AskBobButton {...ctx} />);
    expect(screen.queryByLabelText('Deine Frage')).toBeNull();
    oeffnen();
    expect(screen.getByLabelText('Deine Frage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'An Claude übergeben' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Deine Frage'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'An Claude übergeben' })).toBeDisabled();
  });

  it('teilt den Prompt und meldet „In die Claude-App geteilt“', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, userAgentData: { mobile: true } });
    render(<AskBobButton {...ctx} element={{ art: 'karte', frage: 'F?', antwort: 'A' }} />);
    oeffnen();
    fireEvent.change(screen.getByLabelText('Deine Frage'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'An Claude übergeben' }));
    expect(await screen.findByText('In die Claude-App geteilt')).toBeInTheDocument();
    const text = share.mock.calls[0]![0].text as string;
    expect(text).toContain('Ich lerne für Mathe, Thema Ableitungen.');
    expect(text).toContain('Warum?');
    expect(text).toContain('F?');
  });

  it('kopiert und meldet „Kopiert, in Claude einfügen“', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('open', open);
    render(<AskBobButton {...ctx} />);
    oeffnen();
    fireEvent.change(screen.getByLabelText('Deine Frage'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'An Claude übergeben' }));
    expect(await screen.findByText('Kopiert, in Claude einfügen')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener');
  });

  it('Abbruch im Teilen-Menü zeigt keine Erfolgsmeldung', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'));
    vi.stubGlobal('navigator', { share, userAgentData: { mobile: true } });
    render(<AskBobButton {...ctx} />);
    oeffnen();
    fireEvent.change(screen.getByLabelText('Deine Frage'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'An Claude übergeben' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText(/geteilt|Kopiert/)).toBeNull();
    expect(screen.getByRole('button', { name: 'An Claude übergeben' })).toBeEnabled();
  });

  it('ohne Zwischenablage: Text zum Selbstkopieren in einem Textfeld', async () => {
    vi.stubGlobal('navigator', {});
    render(<AskBobButton {...ctx} />);
    oeffnen();
    fireEvent.change(screen.getByLabelText('Deine Frage'), { target: { value: 'Warum?' } });
    fireEvent.click(screen.getByRole('button', { name: 'An Claude übergeben' }));
    const feld = (await screen.findByLabelText('Text zum Kopieren')) as HTMLTextAreaElement;
    expect(feld.readOnly).toBe(true);
    expect(feld.value).toContain('Warum?');
  });
});
