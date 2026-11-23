import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/App';
import { Markdown } from '../../src/ui/components/Markdown';
import type { LernIndex } from '../../src/format/types';
import { openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  db = await openLernDb(`thema-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'pc');
});

async function oeffne(themaId: string) {
  window.location.hash = `#/thema/mathe/${themaId}`;
  const { client } = fakeClient(index);
  render(<App db={db} createClient={() => client} now={() => new Date('2026-11-22T12:00:00Z')} />);
  return screen.findByRole('heading', { level: 1, name: /Ableitungen|Taylor/ });
}

describe('Themenansicht', () => {
  it('Reiter Text zeigt die Zusammenfassung, Formeln als KaTeX', async () => {
    await oeffne('mathe-ableitungen');
    expect(await screen.findByText(/gibt die Steigung von/)).toBeInTheDocument();
    expect(document.querySelector('.katex')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Dieses Thema wiederholen' })).toHaveAttribute(
      'href',
      '#/wiederholen?fach=mathe&thema=mathe-ableitungen',
    );
  });

  it('Reiter Karten zeigt 2 aktive Karten, Antwort erst nach Tipp; zurückgezogene fehlt', async () => {
    await oeffne('mathe-ableitungen');
    fireEvent.click(await screen.findByRole('tab', { name: 'Karten' }));
    const liste = await screen.findAllByRole('listitem');
    expect(liste).toHaveLength(2);
    expect(screen.queryByText(/Alte Karte/)).toBeNull();
    expect(screen.queryByText(/Äußere mal innere/)).toBeNull();
    fireEvent.click(within(liste[1]!).getByRole('button', { name: /Antwort/ }));
    expect(await screen.findByText(/Äußere mal innere/)).toBeInTheDocument();
  });

  it('Reiter Mindmap nur wenn vorhanden', async () => {
    await oeffne('mathe-ableitungen');
    expect(await screen.findByRole('tab', { name: 'Mindmap' })).toBeInTheDocument();
  });

  it('Reiter Übungen zeigt die aktiven Übungen, Eingabe-Übung lässt sich prüfen', async () => {
    await oeffne('mathe-ableitungen');
    fireEvent.click(await screen.findByRole('tab', { name: 'Übungen' }));
    const liste = await screen.findAllByRole('article');
    expect(liste).toHaveLength(4);
    fireEvent.change(within(liste[0]!).getByRole('textbox'), { target: { value: '12' } });
    fireEvent.click(within(liste[0]!).getByRole('button', { name: 'Prüfen' }));
    expect(await within(liste[0]!).findByText('Richtig')).toBeInTheDocument();
  });

  it('Thema ohne Mindmap hat keinen Reiter „Mindmap“', async () => {
    await oeffne('mathe-taylor-dg');
    expect(await screen.findByRole('tab', { name: 'Text' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Mindmap' })).toBeNull();
  });

  it('unbekanntes Thema → Hinweis', async () => {
    window.location.hash = '#/thema/mathe/gibtsnicht';
    const { client } = fakeClient(index);
    render(<App db={db} createClient={() => client} />);
    expect(await screen.findByText('Thema nicht gefunden')).toBeInTheDocument();
  });
});

describe('Markdown', () => {
  it('rendert kein rohes HTML (script bleibt Text), Links sicher, Tabellen scrollbar', () => {
    const { container } = render(
      <Markdown text={'<script>alert(1)</script>\n\n[x](https://example.org)\n\n| a | b |\n|---|---|\n| 1 | 2 |'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    const a = screen.getByRole('link', { name: 'x' });
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.querySelector('.tabelle-scroll table')).not.toBeNull();
  });
});

describe('Frag Bob im Thema', () => {
  it('Kopf-Knopf und Knopf je Übung', async () => {
    await oeffne('mathe-ableitungen');
    expect(await screen.findByRole('button', { name: 'Frag Bob' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('tab', { name: 'Übungen' }));
    const liste = await screen.findAllByRole('article');
    expect(within(liste[0]!).getByRole('button', { name: 'Frag Bob' })).toBeInTheDocument();
  });
});
