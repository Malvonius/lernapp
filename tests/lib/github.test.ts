import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, GitHubError } from '../../src/lib/github';

const TOKEN = 'ghp_geheimes_token_123';
const BASE = 'https://api.github.com/repos/Malvonius/lernstoff/contents';

function res(status: number, body: unknown = '', headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(status === 304 ? null : text, { status, headers });
}
function client(fn: (url: string, init?: RequestInit) => Promise<Response>) {
  const f = vi.fn(fn);
  return { gh: createGitHubClient(TOKEN, f as unknown as typeof fetch), f };
}
function call(f: { mock: { calls: unknown[][] } }): [string, RequestInit | undefined] {
  return f.mock.calls[0] as [string, RequestInit | undefined];
}
async function catchErr(p: Promise<unknown>): Promise<GitHubError> {
  try {
    await p;
  } catch (e) {
    return e as GitHubError;
  }
  throw new Error('kein Fehler geworfen');
}

describe('getRaw', () => {
  it('codiert Pfadsegmente, setzt Ref, Auth und Accept', async () => {
    const { gh, f } = client(async () => res(200, 'inhalt', { etag: '"abc"' }));
    const r = await gh.getRaw('Mathe/01 Analysis/Taylor & DG.md');
    expect(r).toEqual({ text: 'inhalt', etag: '"abc"' });
    const [url, init] = call(f);
    expect(url).toBe(`${BASE}/Mathe/01%20Analysis/Taylor%20%26%20DG.md?ref=main`);
    const h = new Headers(init?.headers);
    expect(h.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(h.get('accept')).toBe('application/vnd.github.raw+json');
  });
  it('schickt If-None-Match und gibt bei 304 unchanged zurück', async () => {
    const { gh, f } = client(async () => res(304));
    expect(await gh.getRaw('a.md', '"abc"')).toBe('unchanged');
    expect(new Headers(call(f)[1]?.headers).get('if-none-match')).toBe('"abc"');
  });
  it('etag ist null, wenn kein Header kommt', async () => {
    const { gh } = client(async () => res(200, 'x'));
    expect(await gh.getRaw('a.md')).toEqual({ text: 'x', etag: null });
  });
});

describe('Fehler', () => {
  it('401 -> auth', async () => {
    const { gh } = client(async () => res(401, { message: 'Bad credentials' }));
    const e = await catchErr(gh.getRaw('a.md'));
    expect(e).toBeInstanceOf(GitHubError);
    expect(e.kind).toBe('auth');
    expect(e.status).toBe(401);
  });
  it('403 mit ratelimit-remaining 0 -> ratelimit', async () => {
    const { gh } = client(async () => res(403, '', { 'x-ratelimit-remaining': '0' }));
    expect((await catchErr(gh.getRaw('a.md'))).kind).toBe('ratelimit');
  });
  it('403 mit retry-after -> ratelimit', async () => {
    const { gh } = client(async () => res(403, '', { 'retry-after': '60' }));
    expect((await catchErr(gh.getRaw('a.md'))).kind).toBe('ratelimit');
  });
  it('403 ohne Limit -> auth', async () => {
    const { gh } = client(async () => res(403));
    expect((await catchErr(gh.getRaw('a.md'))).kind).toBe('auth');
  });
  it('404 bei getRaw -> notfound', async () => {
    const { gh } = client(async () => res(404));
    expect((await catchErr(gh.getRaw('a.md'))).kind).toBe('notfound');
  });
  it('409 und 422 bei putFile -> conflict', async () => {
    for (const s of [409, 422]) {
      const { gh } = client(async () => res(s));
      expect((await catchErr(gh.putFile('a.md', 'x', 'sha', 'm'))).kind).toBe('conflict');
    }
  });
  it('fetch wirft -> network', async () => {
    const { gh } = client(async () => {
      throw new TypeError('Failed to fetch');
    });
    const e = await catchErr(gh.getRaw('a.md'));
    expect(e.kind).toBe('network');
  });
  it('500 -> other', async () => {
    const { gh } = client(async () => res(500));
    expect((await catchErr(gh.getRaw('a.md'))).kind).toBe('other');
  });
  it('Fehler enthalten nie das Token', async () => {
    const { gh } = client(async () => res(401, { message: `Bad ${TOKEN}` }));
    const e = await catchErr(gh.getRaw('a.md'));
    expect(String(e)).not.toContain(TOKEN);
    expect(e.message).not.toContain(TOKEN);
    const n = client(async () => {
      throw new TypeError(`boom ${TOKEN}`);
    });
    const e2 = await catchErr(n.gh.getRaw('a.md'));
    expect(String(e2)).not.toContain(TOKEN);
    expect(e2.message).not.toContain(TOKEN);
  });
});

describe('getFile', () => {
  it('liefert Text (UTF-8) und sha', async () => {
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode('Prüfung äöü')));
    const withBreaks = b64.slice(0, 8) + '\n' + b64.slice(8);
    const { gh } = client(async () => res(200, { sha: 'S1', content: withBreaks, encoding: 'base64' }));
    expect(await gh.getFile('a.md')).toEqual({ text: 'Prüfung äöü', sha: 'S1' });
  });
  it('große Datei (encoding none): holt Raw, behält sha', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) =>
      new Headers(init?.headers).get('accept') === 'application/vnd.github.raw+json'
        ? res(200, 'großer Inhalt')
        : res(200, { sha: 'abc', content: '', encoding: 'none', size: 2000000 }),
    );
    const gh = createGitHubClient(TOKEN, f as unknown as typeof fetch);
    expect(await gh.getFile('a.md')).toEqual({ text: 'großer Inhalt', sha: 'abc' });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('große Datei: schlägt Raw fehl, Fehler statt leerem Text', async () => {
    let n = 0;
    const { gh } = client(async () => (n++ === 0 ? res(200, { sha: 'abc', content: '', encoding: 'none', size: 2000000 }) : res(500)));
    expect((await catchErr(gh.getFile('a.md'))).kind).toBe('other');
  });
  it('404 -> null', async () => {
    const { gh } = client(async () => res(404));
    expect(await gh.getFile('a.md')).toBeNull();
  });
});

describe('putFile', () => {
  it('überträgt Base64 als UTF-8 samt sha und Message', async () => {
    const { gh, f } = client(async () => res(200, { content: { sha: 'NEU' } }));
    const r = await gh.putFile('_fortschritt/x.jsonl', 'Prüfung äöü', 'ALT', 'sync');
    expect(r).toEqual({ sha: 'NEU' });
    const [url, init] = call(f);
    expect(url).toBe(`${BASE}/_fortschritt/x.jsonl`);
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(init?.body as string);
    expect(body.sha).toBe('ALT');
    expect(body.message).toBe('sync');
    expect(body.branch).toBe('main');
    const bytes = Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe('Prüfung äöü');
  });
  it('lässt sha weg, wenn null (neue Datei)', async () => {
    const { gh, f } = client(async () => res(201, { content: { sha: 'N' } }));
    await gh.putFile('a.md', 'x', null, 'm');
    expect('sha' in JSON.parse(call(f)[1]?.body as string)).toBe(false);
  });
});

describe('listDir', () => {
  it('gibt Dateinamen zurück', async () => {
    const { gh, f } = client(async () =>
      res(200, [
        { name: 'a.jsonl', type: 'file' },
        { name: 'b.jsonl', type: 'file' },
        { name: 'sub', type: 'dir' },
      ]),
    );
    expect(await gh.listDir('_fortschritt')).toEqual(['a.jsonl', 'b.jsonl']);
    expect(call(f)[0]).toBe(`${BASE}/_fortschritt?ref=main`);
  });
  it('404 -> []', async () => {
    const { gh } = client(async () => res(404));
    expect(await gh.listDir('_fortschritt')).toEqual([]);
  });
});

describe('testAccess', () => {
  it('ok bei 200', async () => {
    const { gh, f } = client(async () => res(200, {}));
    await gh.testAccess();
    expect(call(f)[0]).toBe('https://api.github.com/repos/Malvonius/lernstoff');
  });
  it('401 -> auth', async () => {
    const { gh } = client(async () => res(401));
    expect((await catchErr(gh.testAccess())).kind).toBe('auth');
  });
});
