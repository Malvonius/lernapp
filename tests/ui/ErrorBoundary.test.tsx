import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/App';
import { openLernDb } from '../../src/lib/db';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary';

afterEach(() => vi.restoreAllMocks());

function Kaputt(): never {
  throw new Error('kaputt');
}

describe('ErrorBoundary', () => {
  it('zeigt statt weißem Bildschirm eine Seite mit „Neu laden“ und Link zu den Einstellungen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const neuLaden = vi.fn();
    render(
      <ErrorBoundary neuLaden={neuLaden}>
        <Kaputt />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Da ist etwas schiefgelaufen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '#/einstellungen');
    fireEvent.click(screen.getByRole('button', { name: 'Neu laden' }));
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });

  it('ohne Fehler: Kinder normal', () => {
    render(
      <ErrorBoundary>
        <p>alles gut</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('alles gut')).toBeInTheDocument();
  });

  it('App fängt Render-Fehler (auch im Zustand) ab', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.location.hash = '';
    render(
      <App
        db={await openLernDb('eb-1')}
        now={() => {
          throw new Error('kaputt');
        }}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Da ist etwas schiefgelaufen' })).toBeInTheDocument();
  });
});
