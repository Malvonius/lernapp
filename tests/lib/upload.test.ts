import { describe, expect, it } from 'vitest';
import { GitHubError, type GitHubClient } from '../../src/lib/github';
import { inboxListe, inboxPfad, ladeHoch, MAX_BYTES, pruefeDatei, rueckfragenListe, UploadFehler } from '../../src/lib/upload';

/** Wiener Ortszeit: 20:15 im November (MEZ) = 19:15 UTC */
const JETZT = new Date('2026-11-23T19:15:00Z');

class FakeRepo implements GitHubClient {
  files = new Map<string, Uint8Array | string>();
  puts: string[] = [];
  /** Pfad-Endungen, bei denen das Schreiben scheitert */
  failEnde: Record<string, GitHubError> = {};
  async getRaw(path: string) {
    const f = this.files.get(path);
    if (f === undefined) throw new GitHubError('notfound', 404);
    return { text: typeof f === 'string' ? f : '', etag: null };
  }
  async getFile(path: string) {
    const f = this.files.get(path);
    return f === undefined ? null : { text: typeof f === 'string' ? f : '', sha: 'x' };
  }
  private schreibe(path: string, inhalt: Uint8Array | string) {
    for (const [ende, err] of Object.entries(this.failEnde)) if (path.endsWith(ende)) throw err;
    if (this.files.has(path)) throw new GitHubError('conflict', 422);
    this.files.set(path, inhalt);
    this.puts.push(path);
    return { sha: 's' };
  }
  async putFile(path: string, text: string) {
    return this.schreibe(path, text);
  }
  async putBinary(path: string, bytes: Uint8Array) {
    return this.schreibe(path, bytes);
  }
  async listDir(path: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')).map((p) => p.slice(path.length + 1));
  }
  async testAccess() {}
}

describe('pruefeDatei', () => {
  it('nimmt erlaubte Endungen (auch Großschreibung) an', () => {
    for (const n of ['a.pdf', 'b.DOCX', 'c.doc', 'd.odt', 'e.pptx', 'f.ppt', 'g.xlsx', 'h.png', 'i.JPG', 'j.jpeg', 'k.heic', 'l.zip', 'm.txt', 'n.md']) {
      expect(pruefeDatei(n, 1000), n).toBeNull();
    }
  });
  it('lehnt unbekannte oder fehlende Endung ab', () => {
    expect(pruefeDatei('virus.exe', 10)).toMatch(/Dateityp/);
    expect(pruefeDatei('ohneendung', 10)).toMatch(/Dateityp/);
    expect(pruefeDatei('x.pdf.exe', 10)).toMatch(/Dateityp/);
  });
  it('lehnt > 25 MB ab, genau 25 MB passt, leer wird abgelehnt', () => {
    expect(MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(pruefeDatei('a.pdf', MAX_BYTES)).toBeNull();
    expect(pruefeDatei('a.pdf', MAX_BYTES + 1)).toMatch(/25 MB/);
    expect(pruefeDatei('a.pdf', 0)).toMatch(/leer/);
  });
});

describe('inboxPfad', () => {
  it('Zeitstempel in Wiener Ortszeit, Umlaute und Leerzeichen bleiben', () => {
    expect(inboxPfad('Übung 3 & Lösung.pdf', JETZT)).toBe('_inbox/20261123-201500_Übung 3 & Lösung.pdf');
  });
  it('Sommerzeit (MESZ, UTC+2)', () => {
    expect(inboxPfad('a.pdf', new Date('2026-07-01T10:05:09Z'))).toBe('_inbox/20260701-120509_a.pdf');
  });
  it('Pfadtrenner, .. und Sonderzeichen werden entfernt: nie außerhalb von _inbox', () => {
    for (const boese of ['../../etc/passwd.txt', '..\\..\\x.txt', 'a/b/c.txt', '/abs.txt', 'a:b*c?d"e<f>g|h.txt', '....//x.txt', 'a\u0000b\u001f.txt']) {
      const p = inboxPfad(boese, JETZT);
      expect(p.startsWith('_inbox/20261123-201500_'), boese).toBe(true);
      const rest = p.slice('_inbox/'.length);
      expect(rest, boese).not.toMatch(/[\\/:*?"<>|\u0000-\u001f]/);
      expect(rest, boese).not.toContain('..');
      expect(rest.endsWith('.txt'), boese).toBe(true);
    }
    expect(inboxPfad('a/../b.txt', JETZT)).toBe('_inbox/20261123-201500_ab.txt');
  });
  it('führende Punkte entfallen, leerer Name wird zu „datei“ mit Endung', () => {
    expect(inboxPfad('.hidden.md', JETZT)).toBe('_inbox/20261123-201500_hidden.md');
    expect(inboxPfad('///.pdf', JETZT)).toBe('_inbox/20261123-201500_datei.pdf');
  });
  it('kürzt auf höchstens 120 Zeichen und behält die Endung', () => {
    const p = inboxPfad('ä'.repeat(300) + '.pdf', JETZT);
    const name = p.slice('_inbox/20261123-201500_'.length);
    expect(name.length).toBe(120);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('ladeHoch', () => {
  const datei = { name: 'Skript.pdf', bytes: new Uint8Array([1, 2, 3]) };
  const meta = { fach: 'mathe', wunsch: 'mehr Übungen' };

  it('lädt Datei, dann .meta.json mit dem Inbox-Format', async () => {
    const repo = new FakeRepo();
    const r = await ladeHoch(repo, datei, meta, 'handy', JETZT);
    expect(r.pfad).toBe('_inbox/20261123-201500_Skript.pdf');
    expect(repo.puts).toEqual([r.pfad, `${r.pfad}.meta.json`]);
    expect(repo.files.get(r.pfad)).toEqual(new Uint8Array([1, 2, 3]));
    expect(JSON.parse(repo.files.get(`${r.pfad}.meta.json`) as string)).toEqual({
      fach: 'mathe',
      wunsch: 'mehr Übungen',
      hochgeladen: '2026-11-23T19:15:00.000Z',
      geraet: 'handy',
    });
  });
  it('leerer Wunsch und „Bob entscheidet“ werden null', async () => {
    const repo = new FakeRepo();
    const r = await ladeHoch(repo, datei, { fach: null, wunsch: '   ' }, 'pc', JETZT);
    expect(JSON.parse(repo.files.get(`${r.pfad}.meta.json`) as string)).toMatchObject({ fach: null, wunsch: null });
  });
  it('gleicher Name zur selben Sekunde: kein Überschreiben, Suffix -2, -3', async () => {
    const repo = new FakeRepo();
    const a = await ladeHoch(repo, datei, meta, 'pc', JETZT);
    const b = await ladeHoch(repo, { ...datei, bytes: new Uint8Array([9]) }, meta, 'pc', JETZT);
    const c = await ladeHoch(repo, datei, meta, 'pc', JETZT);
    expect(a.pfad).toBe('_inbox/20261123-201500_Skript.pdf');
    expect(b.pfad).toBe('_inbox/20261123-201500_Skript-2.pdf');
    expect(c.pfad).toBe('_inbox/20261123-201500_Skript-3.pdf');
    expect(repo.files.get(a.pfad)).toEqual(new Uint8Array([1, 2, 3]));
    expect(repo.files.get(b.pfad)).toEqual(new Uint8Array([9]));
  });
  it('Kollision, die erst beim Schreiben auffällt (422), nimmt den nächsten Suffix', async () => {
    const repo = new FakeRepo();
    repo.listDir = async () => []; // Liste veraltet
    repo.files.set('_inbox/20261123-201500_Skript.pdf', new Uint8Array([0]));
    const r = await ladeHoch(repo, datei, meta, 'pc', JETZT);
    expect(r.pfad).toBe('_inbox/20261123-201500_Skript-2.pdf');
    expect(repo.files.get('_inbox/20261123-201500_Skript.pdf')).toEqual(new Uint8Array([0]));
  });
  it('böser Dateiname landet trotzdem nur in _inbox/', async () => {
    const repo = new FakeRepo();
    const r = await ladeHoch(repo, { name: '../../.github/workflows/x.md', bytes: new Uint8Array([1]) }, meta, 'pc', JETZT);
    expect(r.pfad.startsWith('_inbox/')).toBe(true);
    expect(r.pfad.slice('_inbox/'.length)).not.toMatch(/[\\/]/);
    expect([...repo.files.keys()].every((p) => p.startsWith('_inbox/'))).toBe(true);
  });
  it('Datei scheitert (Token ohne Schreibrecht): Fehler wird durchgereicht, nichts geschrieben', async () => {
    const repo = new FakeRepo();
    repo.failEnde = { 'Skript.pdf': new GitHubError('notfound', 404) };
    await expect(ladeHoch(repo, datei, meta, 'pc', JETZT)).rejects.toMatchObject({ kind: 'notfound' });
    expect(repo.files.size).toBe(0);
  });
  it('Offline: network-Fehler, nichts geschrieben', async () => {
    const repo = new FakeRepo();
    repo.listDir = async () => {
      throw new GitHubError('network');
    };
    await expect(ladeHoch(repo, datei, meta, 'pc', JETZT)).rejects.toMatchObject({ kind: 'network' });
    expect(repo.files.size).toBe(0);
  });
  it('meta scheitert: UploadFehler(meta) mit „nochmal“-Hinweis, Datei bleibt', async () => {
    const repo = new FakeRepo();
    repo.failEnde = { '.meta.json': new GitHubError('network') };
    const e = await ladeHoch(repo, datei, meta, 'pc', JETZT).catch((x) => x);
    expect(e).toBeInstanceOf(UploadFehler);
    expect(e.teil).toBe('meta');
    expect(e.pfad).toBe('_inbox/20261123-201500_Skript.pdf');
    expect(e.message).toMatch(/nochmal/);
    expect(repo.files.has('_inbox/20261123-201500_Skript.pdf')).toBe(true);
  });
  it('ungültige Datei wird vor jedem Netzwerkzugriff abgelehnt', async () => {
    const repo = new FakeRepo();
    let netz = 0;
    repo.listDir = async () => {
      netz++;
      return [];
    };
    await expect(ladeHoch(repo, { name: 'x.exe', bytes: new Uint8Array([1]) }, meta, 'pc', JETZT)).rejects.toThrow(/Dateityp/);
    expect(netz).toBe(0);
  });
});

describe('inboxListe / rueckfragenListe', () => {
  it('Inbox ohne .meta.json und .gitkeep', async () => {
    const repo = new FakeRepo();
    for (const n of ['_inbox/.gitkeep', '_inbox/a.pdf', '_inbox/a.pdf.meta.json', '_inbox/b.png']) repo.files.set(n, 'x');
    expect(await inboxListe(repo)).toEqual(['a.pdf', 'b.png']);
  });
  it('Rückfragen: nur .md', async () => {
    const repo = new FakeRepo();
    for (const n of ['_rueckfrage/2026-11-23-x.md', '_rueckfrage/.gitkeep', '_rueckfrage/notiz.txt']) repo.files.set(n, 'x');
    expect(await rueckfragenListe(repo)).toEqual(['2026-11-23-x.md']);
  });
});
