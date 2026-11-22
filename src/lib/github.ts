import { REPO } from './config';

export type GitHubErrorKind = 'auth' | 'notfound' | 'conflict' | 'ratelimit' | 'network' | 'other';

const MESSAGES: Record<GitHubErrorKind, string> = {
  auth: 'GitHub hat den Zugang abgelehnt (Token prüfen).',
  notfound: 'Auf GitHub nicht gefunden.',
  conflict: 'Die Datei wurde zwischenzeitlich geändert.',
  ratelimit: 'GitHub-Anfragelimit erreicht.',
  network: 'Keine Verbindung zu GitHub.',
  other: 'GitHub hat einen Fehler gemeldet.',
};

/** Fehlermeldungen sind feste Texte: nie Token, Antwort- oder Originaltexte übernehmen. */
export class GitHubError extends Error {
  kind: GitHubErrorKind;
  status?: number;
  constructor(kind: GitHubErrorKind, status?: number) {
    super(MESSAGES[kind]);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = status;
  }
}

export interface GitHubClient {
  getRaw(path: string, etag?: string): Promise<{ text: string; etag: string | null } | 'unchanged'>;
  getFile(path: string): Promise<{ text: string; sha: string } | null>;
  putFile(path: string, text: string, sha: string | null, message: string): Promise<{ sha: string }>;
  listDir(path: string): Promise<string[]>;
  testAccess(): Promise<void>;
}

const API = 'https://api.github.com';
const REPO_URL = `${API}/repos/${REPO.owner}/${REPO.repo}`;

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function errorFor(res: Response, put: boolean): GitHubError {
  const s = res.status;
  if (s === 401) return new GitHubError('auth', s);
  if (s === 403 || s === 429) {
    const limited = res.headers.get('x-ratelimit-remaining') === '0' || s === 429;
    return new GitHubError(limited ? 'ratelimit' : 'auth', s);
  }
  if (s === 404) return new GitHubError('notfound', s);
  if (put && (s === 409 || s === 422)) return new GitHubError('conflict', s);
  return new GitHubError('other', s);
}

export function createGitHubClient(token: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): GitHubClient {
  async function request(url: string, init: RequestInit = {}, accept = 'application/vnd.github+json', extra: Record<string, string> = {}) {
    try {
      return await fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, Accept: accept, ...extra },
      });
    } catch {
      throw new GitHubError('network');
    }
  }
  const contentsUrl = (path: string) => `${REPO_URL}/contents/${encodePath(path)}`;
  const ref = `?ref=${encodeURIComponent(REPO.branch)}`;

  return {
    async getRaw(path, etag) {
      const res = await request(contentsUrl(path) + ref, {}, 'application/vnd.github.raw+json', etag ? { 'If-None-Match': etag } : {});
      if (res.status === 304) return 'unchanged';
      if (!res.ok) throw errorFor(res, false);
      return { text: await res.text(), etag: res.headers.get('etag') };
    },
    async getFile(path) {
      const res = await request(contentsUrl(path) + ref);
      if (res.status === 404) return null;
      if (!res.ok) throw errorFor(res, false);
      const j = (await res.json()) as { sha: string; content: string };
      return { text: fromBase64(j.content), sha: j.sha };
    },
    async putFile(path, text, sha, message) {
      const body: Record<string, string> = { message, content: toBase64(text), branch: REPO.branch };
      if (sha) body.sha = sha;
      const res = await request(contentsUrl(path), { method: 'PUT', body: JSON.stringify(body) }, 'application/vnd.github+json', {
        'Content-Type': 'application/json',
      });
      if (!res.ok) throw errorFor(res, true);
      const j = (await res.json()) as { content: { sha: string } };
      return { sha: j.content.sha };
    },
    async listDir(path) {
      const res = await request(contentsUrl(path) + ref);
      if (res.status === 404) return [];
      if (!res.ok) throw errorFor(res, false);
      const j = (await res.json()) as { name: string; type: string }[];
      return j.filter((e) => e.type === 'file').map((e) => e.name);
    },
    async testAccess() {
      const res = await request(REPO_URL);
      if (!res.ok) throw errorFor(res, false);
    },
  };
}
