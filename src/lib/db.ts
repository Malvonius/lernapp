import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** Platzhalter bis Task 4 (Ereignis-Typ). */
export type StoredEvent = { geraet: string; zeit: string; art: string; ziel: string; [k: string]: unknown };
export type EventKey = [string, string, string, string];
export type StoredFile = { text: string; hash: string };

interface LernDb extends DBSchema {
  settings: { key: string; value: unknown };
  files: { key: string; value: StoredFile };
  meta: { key: string; value: unknown };
  events: { key: EventKey; value: StoredEvent };
  outbox: { key: EventKey; value: StoredEvent };
}
export type LernDatabase = IDBPDatabase<LernDb>;

const KEY_PATH = ['geraet', 'zeit', 'art', 'ziel'];

export const eventKey = (e: StoredEvent): EventKey => [e.geraet, e.zeit, e.art, e.ziel];

export function openLernDb(name = 'lernapp'): Promise<LernDatabase> {
  return openDB<LernDb>(name, 1, {
    upgrade(db) {
      db.createObjectStore('settings');
      db.createObjectStore('files');
      db.createObjectStore('meta');
      db.createObjectStore('events', { keyPath: KEY_PATH });
      db.createObjectStore('outbox', { keyPath: KEY_PATH });
    },
  });
}

export const getSetting = (db: LernDatabase, key: string) => db.get('settings', key);
export const setSetting = async (db: LernDatabase, key: string, value: unknown) => {
  await db.put('settings', value, key);
};
export const getMeta = (db: LernDatabase, key: string) => db.get('meta', key);
export const setMeta = async (db: LernDatabase, key: string, value: unknown) => {
  await db.put('meta', value, key);
};

export const getFile = (db: LernDatabase, path: string) => db.get('files', path);
export const putFile = async (db: LernDatabase, path: string, file: StoredFile) => {
  await db.put('files', file, path);
};
export const deleteFile = (db: LernDatabase, path: string) => db.delete('files', path);

export const getAllEvents = (db: LernDatabase) => db.getAll('events');
/** put über den zusammengesetzten Schlüssel: dasselbe Ereignis ersetzt sich selbst (kein Duplikat). */
export async function addEvents(db: LernDatabase, events: StoredEvent[]): Promise<void> {
  const tx = db.transaction('events', 'readwrite');
  await Promise.all([...events.map((e) => tx.store.put(e)), tx.done]);
}

export const getOutbox = (db: LernDatabase) => db.getAll('outbox');
export async function addToOutbox(db: LernDatabase, events: StoredEvent[]): Promise<void> {
  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all([...events.map((e) => tx.store.put(e)), tx.done]);
}
export async function clearOutbox(db: LernDatabase, ids: EventKey[]): Promise<void> {
  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all([...ids.map((k) => tx.store.delete(k)), tx.done]);
}
