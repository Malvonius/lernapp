import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Route } from '@playwright/test';
import { buildIndex } from '../src/format/buildIndex';

/** GitHub-Mock für E2E und Screenshots: Inhalt nur aus tests/fixtures/lernstoff-mini (bzw. e2e/fixtures). */
export const FIXTURE_ROOT = fileURLToPath(new URL('../tests/fixtures/lernstoff-mini/', import.meta.url));
/** Selbst geschriebenes Test-Thema mit feindlichem Mindmap-Text (kein echter Lernstoff) */
export const XSS_ROOT = fileURLToPath(new URL('./fixtures/lernstoff-xss/', import.meta.url));
export const REPO_PFAD = '/repos/Malvonius/lernstoff';
export const FORTSCHRITT = '_fortschritt/handy.json';
export const TEST_TOKEN = 'e2e-test-token'; // Testwert, kein echtes Token
const INDEX_ETAG = '"e2e-index-1"';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'authorization, accept, content-type, if-none-match',
  'access-control-expose-headers': 'etag',
};

export interface Ereignis {
  art: string;
  ziel: string;
  zeit: string;
  geraet: string;
  bewertung?: number;
  richtig?: boolean;
}
export interface PutAufruf {
  pfad: string;
  inhalt: { version: number; geraet: string; ereignisse: Ereignis[] };
  sha?: string;
}

/** Fake der GitHub-Contents-API: Lernstoff (raw) lesen, _fortschritt listen/lesen/schreiben. */
export class FakeGitHub {
  offline = false;
  /** Anfragen, die im Offline-Modus abgewiesen wurden (Pfad nach /contents/ bzw. „repo“) */
  abgewiesen: string[] = [];
  puts: PutAufruf[] = [];
  /** Uploads nach _inbox/ (Dateien und .meta.json), Inhalt Base64-dekodiert */
  inbox = new Map<string, Buffer>();
  /** Offene Rückfragen: Dateiname → Markdown */
  rueckfragen = new Map<string, string>();
  private fortschritt = new Map<string, { text: string; sha: string }>();
  private shaZaehler = 0;

  constructor(private dateien: Map<string, string>) {}

  /** Fortschrittsdatei eines anderen Geräts vorbelegen (z. B. für die Glut-Serie in Screenshots) */
  fortschrittVorbelegen(pfad: string, inhalt: { version: number; geraet: string; ereignisse: Ereignis[] }) {
    this.fortschritt.set(pfad, { text: JSON.stringify(inhalt), sha: `sha-${++this.shaZaehler}` });
  }

  async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    if (this.offline) {
      this.abgewiesen.push(`${req.method()} ${decodeURIComponent(url.pathname)}`);
      return route.abort('internetdisconnected');
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    const auth = req.headers()['authorization'];
    if (auth !== `Bearer ${TEST_TOKEN}`) return this.json(route, 401, { message: 'Bad credentials' });
    if (url.pathname === REPO_PFAD) return this.json(route, 200, { full_name: 'Malvonius/lernstoff' });

    const praefix = `${REPO_PFAD}/contents/`;
    if (!url.pathname.startsWith(praefix)) return this.json(route, 404, { message: 'Not Found' });
    const pfad = url.pathname.slice(praefix.length).split('/').map(decodeURIComponent).join('/');

    if (req.method() === 'PUT' && pfad.startsWith('_inbox/')) {
      const { content } = req.postDataJSON() as { content: string };
      if (this.inbox.has(pfad)) return this.json(route, 422, { message: 'name exists' });
      this.inbox.set(pfad, Buffer.from(content, 'base64'));
      return this.json(route, 201, { content: { sha: `sha-${++this.shaZaehler}` } });
    }
    if (req.method() === 'PUT') return this.put(route, pfad, req.postDataJSON() as { content: string; sha?: string });

    const raw = (req.headers()['accept'] ?? '').includes('raw');
    if (pfad === '_inbox' || pfad === '_rueckfrage') {
      const namen =
        pfad === '_inbox' ? [...this.inbox.keys()].map((k) => k.slice('_inbox/'.length)) : [...this.rueckfragen.keys()];
      if (namen.length === 0) return this.json(route, 404, { message: 'Not Found' });
      return this.json(route, 200, namen.map((name) => ({ name, type: 'file' })));
    }
    if (pfad.startsWith('_rueckfrage/') && this.rueckfragen.has(pfad.slice('_rueckfrage/'.length))) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' }, body: this.rueckfragen.get(pfad.slice('_rueckfrage/'.length))! });
    }
    if (pfad === '_fortschritt') {
      const namen = [...this.fortschritt.keys()].map((p) => p.slice('_fortschritt/'.length));
      if (namen.length === 0) return this.json(route, 404, { message: 'Not Found' });
      return this.json(route, 200, namen.map((name) => ({ name, type: 'file' })));
    }
    const fort = this.fortschritt.get(pfad);
    if (fort) {
      const etag = `"${fort.sha}"`;
      if (raw && req.headers()['if-none-match'] === etag) return route.fulfill({ status: 304, headers: { ...CORS, etag } });
      if (raw) return route.fulfill({ status: 200, headers: { ...CORS, etag }, body: fort.text });
      return this.json(route, 200, { sha: fort.sha, encoding: 'base64', content: Buffer.from(fort.text).toString('base64') });
    }
    const text = this.dateien.get(pfad);
    if (text === undefined) return this.json(route, 404, { message: 'Not Found' });
    if (pfad === 'index.json' && req.headers()['if-none-match'] === INDEX_ETAG) {
      return route.fulfill({ status: 304, headers: { ...CORS, etag: INDEX_ETAG } });
    }
    const etag = pfad === 'index.json' ? INDEX_ETAG : `"${pfad}"`;
    return route.fulfill({ status: 200, headers: { ...CORS, etag, 'content-type': 'text/plain; charset=utf-8' }, body: text });
  }

  private put(route: Route, pfad: string, body: { content: string; sha?: string }) {
    const vorher = this.fortschritt.get(pfad);
    if ((vorher?.sha ?? undefined) !== body.sha) return this.json(route, 409, { message: 'sha mismatch' });
    const text = Buffer.from(body.content, 'base64').toString('utf8');
    const sha = `sha-${++this.shaZaehler}`;
    this.fortschritt.set(pfad, { text, sha });
    this.puts.push({ pfad, inhalt: JSON.parse(text), sha: body.sha });
    return this.json(route, 200, { content: { sha } });
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
}

export async function ladeFixture(root = FIXTURE_ROOT): Promise<Map<string, string>> {
  const { index } = await buildIndex(root, { fix: false, now: new Date('2026-11-22T08:00:00.000Z') });
  const dateien = new Map<string, string>([['index.json', JSON.stringify(index)]]);
  for (const f of index.faecher) {
    for (const t of [...f.kapitel.flatMap((k) => k.themen), ...f.nichtZugeordnet]) {
      if (t.pfad) dateien.set(t.pfad, await readFile(root + t.pfad, 'utf8'));
    }
  }
  return dateien;
}
