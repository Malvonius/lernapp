import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../src/App';
import type { LernIndex } from '../../src/format/types';
import { syncContent } from '../../src/lib/contentSync';
import { openLernDb, setSetting, type LernDatabase } from '../../src/lib/db';
import { GitHubError, type GitHubClient } from '../../src/lib/github';
import { fakeClient, fixtureIndex } from './fakes';

let index: LernIndex;
beforeAll(async () => {
  index = await fixtureIndex();
});

let n = 0;
let db: LernDatabase;
beforeEach(async () => {
  window.location.hash = '#/hochladen';
  db = await openLernDb(`hochladen-${n++}`);
  await setSetting(db, 'token', 'test-token');
  await setSetting(db, 'geraet', 'handy');
});

interface Aufzeichnung {
  binaer: { pfad: string; bytes: Uint8Array }[];
  texte: { pfad: string; text: string }[];
}

/** Fixture-Client plus Inbox/Rückfragen: schreibt in `rec`, `inbox`/`rueckfragen` sind die vorhandenen Dateien. */
function uploadClient(opts: { inbox?: string[]; rueckfragen?: Record<string, string>; putFehler?: GitHubError; metaFehler?: GitHubError } = {}) {
  const basis = fakeClient(index).client;
  const rec: Aufzeichnung = { binaer: [], texte: [] };
  const client: GitHubClient = {
    ...basis,
    async getRaw(path, etag) {
      const r = opts.rueckfragen?.[path.replace('_rueckfrage/', '')];
      if (path.startsWith('_rueckfrage/') && r !== undefined) return { text: r, etag: null };
      return basis.getRaw(path, etag);
    },
    async listDir(path) {
      if (path === '_inbox') return opts.inbox ?? [];
      if (path === '_rueckfrage') return Object.keys(opts.rueckfragen ?? {});
      return [];
    },
    async putBinary(pfad, bytes) {
      if (opts.putFehler) throw opts.putFehler;
      rec.binaer.push({ pfad, bytes });
      return { sha: 'b' };
    },
    async putFile(pfad, text) {
      if (opts.metaFehler && pfad.endsWith('.meta.json')) throw opts.metaFehler;
      rec.texte.push({ pfad, text });
      return { sha: 't' };
    },
  };
  return { client, rec };
}

const datei = (name: string, inhalt: number[] = [1, 2, 3]) => new File([new Uint8Array(inhalt)], name);
const waehle = (feld: HTMLElement, ...dateien: File[]) => fireEvent.change(feld, { target: { files: dateien } });

describe('Hochladen: Upload', () => {
  it('lädt Datei und .meta.json (Fach, Wunsch, Gerät) hoch und zeigt „fertig“', async () => {
    const { client, rec } = uploadClient();
    render(<App db={db} createClient={() => client} />);
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('Skript Übung.pdf'));
    await screen.findByRole('option', { name: 'Angewandte Mathematik' });
    fireEvent.change(screen.getByLabelText('Fach'), { target: { value: 'mathe' } });
    fireEvent.change(screen.getByLabelText(/Wunsch/), { target: { value: 'mehr Übungen zu Taylor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));

    expect(await screen.findByText('fertig')).toBeInTheDocument();
    expect(rec.binaer).toHaveLength(1);
    expect(rec.binaer[0]!.pfad).toMatch(/^_inbox\/\d{8}-\d{6}_Skript Übung\.pdf$/);
    expect(Array.from(rec.binaer[0]!.bytes)).toEqual([1, 2, 3]);
    expect(rec.texte).toHaveLength(1);
    expect(rec.texte[0]!.pfad).toBe(`${rec.binaer[0]!.pfad}.meta.json`);
    expect(JSON.parse(rec.texte[0]!.text)).toMatchObject({ fach: 'mathe', wunsch: 'mehr Übungen zu Taylor', geraet: 'handy' });
  });

  it('„Bob entscheidet“ ist vorgewählt und ergibt fach null', async () => {
    const { client, rec } = uploadClient();
    render(<App db={db} createClient={() => client} />);
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('a.png'));
    expect(screen.getByLabelText('Fach')).toHaveDisplayValue('Bob entscheidet');
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    await screen.findByText('fertig');
    expect(JSON.parse(rec.texte[0]!.text)).toMatchObject({ fach: null, wunsch: null });
  });

  it('mehrere Dateien: jede bekommt ihren Status', async () => {
    const { client, rec } = uploadClient();
    render(<App db={db} createClient={() => client} />);
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('a.pdf'), datei('b.docx'));
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    await waitFor(() => expect(screen.getAllByText('fertig')).toHaveLength(2));
    expect(rec.binaer.map((b) => b.pfad.replace(/^_inbox\/\d{8}-\d{6}_/, '')).sort()).toEqual(['a.pdf', 'b.docx']);
  });

  it('Kamera-Aufnahme wird wie eine Datei behandelt', async () => {
    const { client, rec } = uploadClient();
    render(<App db={db} createClient={() => client} />);
    const kamera = await screen.findByLabelText('Foto aufnehmen');
    expect(kamera).toHaveAttribute('capture');
    expect(kamera).toHaveAttribute('accept', 'image/*');
    waehle(kamera, datei('IMG_1.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    await screen.findByText('fertig');
    expect(rec.binaer[0]!.pfad).toMatch(/IMG_1\.jpg$/);
  });

  it('Dateiauswahl erlaubt nur die freigegebenen Endungen', async () => {
    render(<App db={db} createClient={() => uploadClient().client} />);
    const feld = await screen.findByLabelText('Dateien auswählen');
    expect(feld).toHaveAttribute('multiple');
    expect(feld.getAttribute('accept')).toContain('.pdf');
    expect(feld.getAttribute('accept')).toContain('.heic');
  });

  it('gestylte deutsche Knöpfe statt roher Dateifelder; Felder bleiben per Label erreichbar', async () => {
    render(<App db={db} createClient={() => uploadClient().client} />);
    const feld = await screen.findByLabelText('Dateien auswählen');
    const knopf = screen.getByText('Dateien auswählen');
    expect(knopf.tagName).toBe('LABEL');
    expect(knopf).toHaveClass('button');
    expect(feld).toHaveClass('visually-hidden');
    expect(feld).not.toHaveAttribute('hidden');
    expect(screen.getByText('Foto aufnehmen')).toHaveClass('button');
    expect(screen.getByLabelText('Foto aufnehmen')).toHaveClass('visually-hidden');
    expect(screen.queryByText(/Choose|No file/i)).toBeNull();
  });

  it('Liste der gewählten Dateien: Name, Größe, Entfernen', async () => {
    const { client, rec } = uploadClient();
    render(<App db={db} createClient={() => client} />);
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('a.pdf'), datei('b.docx', new Array(2048).fill(1)));
    const liste = screen.getByRole('list', { name: 'Ausgewählte Dateien' });
    expect(within(liste).getByText('a.pdf')).toBeInTheDocument();
    expect(within(liste).getByText('3 B')).toBeInTheDocument();
    expect(within(liste).getByText('2 KB')).toBeInTheDocument();
    fireEvent.click(within(liste).getByRole('button', { name: 'a.pdf entfernen' }));
    expect(within(liste).queryByText('a.pdf')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    await screen.findByText('fertig');
    expect(rec.binaer).toHaveLength(1);
  });

  it('falscher Dateityp und > 25 MB werden vor dem Upload abgelehnt', async () => {
    const { client, rec } = uploadClient();
    render(<App db={db} createClient={() => client} />);
    const gross = datei('gross.pdf');
    Object.defineProperty(gross, 'size', { value: 25 * 1024 * 1024 + 1 });
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('virus.exe'), gross);
    expect(await screen.findByText(/Dateityp nicht erlaubt/)).toBeInTheDocument();
    expect(screen.getByText(/größer als 25 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hochladen' })).toBeDisabled();
    expect(rec.binaer).toHaveLength(0);
  });

  it('Fehler (Token ohne Schreibrecht) → feste Meldung, Datei bleibt zum erneuten Versuch', async () => {
    const { client } = uploadClient({ putFehler: new GitHubError('notfound', 404) });
    render(<App db={db} createClient={() => client} />);
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('a.pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    expect(await screen.findByText(/Fehler: .*ohne Schreibrecht/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hochladen' })).toBeEnabled();
  });

  it('Datei ok, meta fehlgeschlagen → Meldung „bitte nochmal“', async () => {
    const { client } = uploadClient({ metaFehler: new GitHubError('network') });
    render(<App db={db} createClient={() => client} />);
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('a.pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    expect(await screen.findByText(/nochmal/)).toBeInTheDocument();
    expect(screen.queryByText('fertig')).toBeNull();
  });

  it('während des Uploads zeigt die Datei „lädt …“, dann „fertig“', async () => {
    const { client } = uploadClient();
    let frei: () => void = () => {};
    const gate = new Promise<void>((r) => (frei = r));
    const langsam: GitHubClient = {
      ...client,
      async putBinary(p, b, s, m) {
        await gate;
        return client.putBinary(p, b, s, m);
      },
    };
    render(<App db={db} createClient={() => langsam} />);
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('a.pdf'));
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen' }));
    expect(await screen.findByText('lädt …')).toBeInTheDocument();
    expect(screen.getByLabelText('Wunsch (optional)')).toBeEnabled();
    frei();
    expect(await screen.findByText('fertig')).toBeInTheDocument();
  });

  it('offline: Knopf gesperrt, Hinweis sichtbar', async () => {
    await syncContent(fakeClient(index).client, db);
    const kaputt = fakeClient(index, { fail: new GitHubError('network') }).client;
    render(<App db={db} createClient={() => kaputt} />);
    expect(await screen.findByText(/Offline: Hochladen geht erst wieder mit Verbindung/)).toBeInTheDocument();
    waehle(await screen.findByLabelText('Dateien auswählen'), datei('a.pdf'));
    expect(screen.getByRole('button', { name: 'Hochladen' })).toBeDisabled();
  });
});

describe('Hochladen: Inbox und Rückfragen', () => {
  it('zeigt „Wartet auf Bob“ mit Hinweis für den Chat', async () => {
    const { client } = uploadClient({ inbox: ['20261123-201500_a.pdf', '20261123-201500_a.pdf.meta.json', '.gitkeep'] });
    render(<App db={db} createClient={() => client} />);
    const abschnitt = (await screen.findByRole('heading', { name: 'Wartet auf Bob' })).closest('section')!;
    expect(await within(abschnitt).findByText('20261123-201500_a.pdf')).toBeInTheDocument();
    expect(within(abschnitt).queryByText(/meta\.json/)).toBeNull();
    expect(within(abschnitt).getByText(/Verarbeite die Inbox/)).toBeInTheDocument();
  });

  it('leere Inbox: „Nichts offen“', async () => {
    render(<App db={db} createClient={() => uploadClient().client} />);
    expect(await screen.findByText('Nichts offen.')).toBeInTheDocument();
  });

  it('Rückfrage ist aufklappbar und wird als Markdown ohne rohes HTML gerendert', async () => {
    const md = '# Rückfrage: Skript\n- **Unklar:** Welches Kapitel?\n\n<script>window.__xss = 1</script><img src="x" onerror="window.__xss = 2">\n\n<b>roh</b>';
    const { client } = uploadClient({ rueckfragen: { '2026-11-23-skript.md': md } });
    const { container } = render(<App db={db} createClient={() => client} />);
    const zeile = await screen.findByText('2026-11-23-skript.md');
    fireEvent.click(zeile);
    expect(await screen.findByRole('heading', { name: 'Rückfrage: Skript' })).toBeInTheDocument();
    expect(screen.getByText('Unklar:').tagName).toBe('STRONG');
    expect(container.querySelector('script, img, b')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('ohne Rückfragen: „Keine offenen Rückfragen.“', async () => {
    render(<App db={db} createClient={() => uploadClient().client} />);
    expect(await screen.findByText('Keine offenen Rückfragen.')).toBeInTheDocument();
  });
});
