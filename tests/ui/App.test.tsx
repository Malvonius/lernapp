import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/App';
import { openLernDb } from '../../src/lib/db';

describe('App', () => {
  it('zeigt ohne gespeichertes Token den Einrichten-Screen', async () => {
    window.location.hash = '';
    render(<App db={await openLernDb('app-leer')} />);
    expect(await screen.findByRole('heading', { name: 'Einrichten' })).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub-Token')).toBeInTheDocument();
  });
});
