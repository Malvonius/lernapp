import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/App';

describe('App', () => {
  it('zeigt ohne gespeichertes Token den Einrichten-Screen', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Einrichten' })).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub-Token')).toBeInTheDocument();
  });
});
