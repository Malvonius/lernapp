import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addEvents, addToOutbox, clearOutbox, deleteFile, eventKey, getAllEvents, getFile, getMeta,
  getOutbox, getSetting, openLernDb, putFile, setMeta, setSetting, type StoredEvent,
} from '../../src/lib/db';

let n = 0;
let db: Awaited<ReturnType<typeof openLernDb>>;
beforeEach(async () => {
  db = await openLernDb(`test-${n++}`);
});

const ev = (zeit: string, ziel = 'k1', art = 'karte'): StoredEvent => ({ geraet: 'g1', zeit, art, ziel, note: 3 });

describe('db', () => {
  it('Settings: set/get', async () => {
    expect(await getSetting(db, 'token')).toBeUndefined();
    await setSetting(db, 'token', 'x');
    expect(await getSetting(db, 'token')).toBe('x');
  });
  it('Meta: set/get', async () => {
    await setMeta(db, 'indexEtag', '"e"');
    expect(await getMeta(db, 'indexEtag')).toBe('"e"');
  });
  it('Files: put/get/delete', async () => {
    await putFile(db, 'Mathe/a.md', { text: 't', hash: 'h' });
    expect(await getFile(db, 'Mathe/a.md')).toEqual({ text: 't', hash: 'h' });
    await deleteFile(db, 'Mathe/a.md');
    expect(await getFile(db, 'Mathe/a.md')).toBeUndefined();
  });
  it('addEvents dedupliziert gleiche Ereignisse', async () => {
    await addEvents(db, [ev('2026-01-01T10:00:00Z')]);
    await addEvents(db, [ev('2026-01-01T10:00:00Z')]);
    expect(await getAllEvents(db)).toHaveLength(1);
  });
  it('gleiche Zeit, andere art/ziel kollidieren nicht', async () => {
    await addEvents(db, [ev('t'), ev('t', 'k1', 'uebung'), ev('t', 'k2')]);
    expect(await getAllEvents(db)).toHaveLength(3);
  });
  it('Outbox: add, lesen, löschen', async () => {
    const a = ev('t1');
    const b = ev('t2');
    await addToOutbox(db, [a, b]);
    expect(await getOutbox(db)).toHaveLength(2);
    await clearOutbox(db, [eventKey(a)]);
    expect(await getOutbox(db)).toEqual([b]);
  });
});
