import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Exercise } from '../../src/format/types';

const record = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/state/AppData', () => ({ useAppData: () => ({ record }) }));

import { Uebung } from '../../src/ui/components/Uebung';

const ex = (p: Partial<Exercise>): Exercise => ({
  id: 'u-1',
  typ: 'eingabe',
  frage: 'Frage $x^2$',
  zurueckgezogen: false,
  zeile: 1,
  idZeile: null,
  ...p,
});

beforeEach(() => record.mockClear());

describe('Uebung eingabe', () => {
  const e = ex({ loesung: 8, toleranz: 0.01 });
  it('richtig → „Richtig“ und record(richtig: true)', () => {
    const onErgebnis = vi.fn();
    render(<Uebung ex={e} onErgebnis={onErgebnis} />);
    expect(document.querySelector('.katex')).not.toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(screen.getByText('Richtig')).toBeInTheDocument();
    expect(record).toHaveBeenCalledWith({ art: 'uebung', ziel: 'u-1', richtig: true });
    expect(onErgebnis).toHaveBeenCalledWith(true);
  });
  it('falsch → „Nicht richtig“ mit Lösung, nur einmal aufgezeichnet', () => {
    render(<Uebung ex={e} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(screen.getByText('Nicht richtig')).toBeInTheDocument();
    expect(screen.getByText(/Lösung: 8/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({ art: 'uebung', ziel: 'u-1', richtig: false });
  });
  it('aufzeichnen=false ruft record nicht, onErgebnis schon', () => {
    const onErgebnis = vi.fn();
    render(<Uebung ex={e} aufzeichnen={false} onErgebnis={onErgebnis} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(record).not.toHaveBeenCalled();
    expect(onErgebnis).toHaveBeenCalledWith(true);
  });
  it('ohne id: angezeigt, aber kein record', () => {
    render(<Uebung ex={ex({ id: null, loesung: 8 })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(screen.getByText('Richtig')).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });
  it('aktion-Slot wird gerendert', () => {
    render(<Uebung ex={e} aktion={<span>SLOT</span>} />);
    expect(screen.getByText('SLOT')).toBeInTheDocument();
  });
});

describe('Uebung Robustheit', () => {
  it('record-Fehler wird dem Nutzer gezeigt', async () => {
    record.mockRejectedValueOnce(new Error('x'));
    render(<Uebung ex={ex({ loesung: 8 })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(await screen.findByText('Ergebnis konnte nicht gespeichert werden')).toBeInTheDocument();
  });
  it('Zustand wird bei anderer Übung zurückgesetzt', () => {
    const { rerender } = render(<Uebung ex={ex({ id: 'u-1', loesung: 8 })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(screen.getByText('Richtig')).toBeInTheDocument();
    rerender(<Uebung ex={ex({ id: 'u-2', loesung: 9 })} />);
    expect(screen.queryByText('Richtig')).toBeNull();
    expect(screen.getByRole('button', { name: 'Prüfen' })).toBeInTheDocument();
  });
});

describe('Uebung schritte', () => {
  const e = ex({ typ: 'schritte', schritte: ['Schritt A', 'Schritt B'] });
  it('deckt nacheinander auf, dann Selbsteinschätzung', () => {
    render(<Uebung ex={e} />);
    expect(screen.queryByText('Schritt A')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt zeigen' }));
    expect(screen.getByText('Schritt A')).toBeInTheDocument();
    expect(screen.queryByText('Schritt B')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hab ich gekonnt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nächsten Schritt zeigen' }));
    expect(screen.getByText('Schritt B')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nicht gekonnt' }));
    expect(record).toHaveBeenCalledWith({ art: 'uebung', ziel: 'u-1', richtig: false });
  });
});

describe('Uebung mc', () => {
  const e = ex({ typ: 'mc', optionen: ['x^2', 'x^2 + 5', '2x^2'], richtig: [0, 1] });
  it('falsche Menge → falsch, richtige Antworten markiert', () => {
    render(<Uebung ex={e} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(screen.getByText('Nicht richtig')).toBeInTheDocument();
    expect(screen.getAllByText('Richtige Antwort')).toHaveLength(2);
    expect(record).toHaveBeenCalledWith({ art: 'uebung', ziel: 'u-1', richtig: false });
  });
  it('genau die richtige Menge → richtig', () => {
    render(<Uebung ex={e} />);
    const boxen = screen.getAllByRole('checkbox');
    fireEvent.click(boxen[0]!);
    fireEvent.click(boxen[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(screen.getByText('Richtig')).toBeInTheDocument();
    expect(record).toHaveBeenCalledWith({ art: 'uebung', ziel: 'u-1', richtig: true });
  });
});

describe('Uebung offen', () => {
  const e = ex({ typ: 'offen', musterloesung: 'Die Tangente ist waagrecht.' });
  it('Notiz, Musterlösung zeigen, Selbsteinschätzung', () => {
    render(<Uebung ex={e} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'meine Notiz' } });
    expect(screen.queryByText(/Tangente ist waagrecht/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Musterlösung zeigen' }));
    expect(screen.getByText(/Tangente ist waagrecht/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hab ich gekonnt' }));
    expect(record).toHaveBeenCalledWith({ art: 'uebung', ziel: 'u-1', richtig: true });
  });
});

describe('Uebung aktion als Funktion', () => {
  it('bekommt Element mit Lösung und eigener Antwort und meldet „beantwortet“ erst nach dem Prüfen', () => {
    const stand = vi.fn(() => <span>SLOT</span>);
    render(<Uebung ex={ex({ loesung: 8 })} aktion={stand} />);
    expect(stand).toHaveBeenLastCalledWith({ beantwortet: false, element: { art: 'uebung', frage: 'Frage $x^2$', antwort: '8', meineAntwort: undefined } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(stand).toHaveBeenLastCalledWith({ beantwortet: true, element: { art: 'uebung', frage: 'Frage $x^2$', antwort: '8', meineAntwort: '9' } });
  });
});
