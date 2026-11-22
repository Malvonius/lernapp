import { parseTopic } from '../format/parseTopic';
import type { LernIndex, Topic } from '../format/types';
import { deleteFile, getFile, getMeta, putFile, setMeta, type LernDatabase } from './db';
import { GitHubError, type GitHubClient } from './github';

export interface SyncResult {
  index: LernIndex;
  geaendert: string[];
  offline: boolean;
  stand: string;
}

const INDEX_PATH = 'index.json';

function topicEntries(index: LernIndex): { pfad: string; hash: string | null }[] {
  return index.faecher
    .flatMap((f) => [...f.kapitel.flatMap((k) => k.themen), ...f.nichtZugeordnet])
    .flatMap((t) => (t.pfad === null ? [] : [{ pfad: t.pfad, hash: t.hash }]));
}

async function cachedIndex(db: LernDatabase): Promise<LernIndex | null> {
  const f = await getFile(db, INDEX_PATH);
  if (!f) return null;
  try {
    return JSON.parse(f.text) as LernIndex;
  } catch {
    return null;
  }
}

/** Gleicht index.json und alle Themendateien mit GitHub ab; bei Netzfehler gilt der Cache. */
export async function syncContent(client: GitHubClient, db: LernDatabase): Promise<SyncResult> {
  const cached = await cachedIndex(db);
  try {
    const storedEtag = (await getMeta(db, 'indexEtag')) as string | undefined;
    // ETag nur nutzen, wenn der Index auch im Cache liegt
    const res = await client.getRaw(INDEX_PATH, cached && storedEtag ? storedEtag : undefined);

    let index: LernIndex;
    let indexText: string | null = null;
    let etag: string | null = null;
    if (res === 'unchanged') {
      if (!cached) throw new GitHubError('other');
      index = cached;
    } else {
      index = JSON.parse(res.text) as LernIndex;
      indexText = res.text;
      etag = res.etag;
    }

    const entries = topicEntries(index);
    const geaendert: string[] = [];
    for (const { pfad, hash } of entries) {
      const have = await getFile(db, pfad);
      if (have && hash !== null && have.hash === hash) continue;
      if (have && hash === null && have.hash === '') continue;
      const raw = await client.getRaw(pfad);
      if (raw === 'unchanged') continue;
      await putFile(db, pfad, { text: raw.text, hash: hash ?? '' });
      geaendert.push(pfad);
    }

    const keep = new Set<string>([INDEX_PATH, ...entries.map((e) => e.pfad)]);
    for (const key of await db.getAllKeys('files')) {
      if (!keep.has(key as string)) await deleteFile(db, key as string);
    }

    // Index erst nach den Dateien zwischenspeichern: ein abgebrochener Sync wird so beim nächsten Mal fortgesetzt
    if (indexText !== null) {
      await putFile(db, INDEX_PATH, { text: indexText, hash: etag ?? '' });
      await setMeta(db, 'indexEtag', etag ?? '');
    }
    await setMeta(db, 'lastSync', new Date().toISOString());
    return { index, geaendert, offline: false, stand: index.erstellt };
  } catch (e) {
    if (e instanceof GitHubError && e.kind === 'network' && cached) {
      return { index: cached, geaendert: [], offline: true, stand: cached.erstellt };
    }
    throw e;
  }
}

/** Liest ein Thema aus dem Cache; null, wenn es dort nicht liegt. */
export async function loadTopic(db: LernDatabase, pfad: string): Promise<Topic | null> {
  const f = await getFile(db, pfad);
  return f ? parseTopic(f.text) : null;
}
