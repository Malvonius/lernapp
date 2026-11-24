import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gitBlobSha } from './gitHash';
import { ensureIds, findDuplicateIds, probeInhalt } from './ids';
import { parseProbe } from './parseProbe';
import { parseSubject } from './parseSubject';
import { parseTopic } from './parseTopic';
import type { IndexChapter, IndexProbe, IndexSubject, IndexTopic, LernIndex, Probe, Topic } from './types';

interface TopicFile {
  pfad: string; // relativ, mit '/'
  ordner: string; // Kapitel-Ordner
  datei: string; // Dateiname ohne .md
  bytes: Buffer;
  topic: Topic;
}

interface ProbeFile {
  pfad: string;
  bytes: Buffer;
  probe: Probe;
}

/** Unterordner eines Fachs mit den Probe-Schularbeiten */
export const PROBEN_ORDNER = '_proben';

const isHidden = (name: string) => name.startsWith('_') || name.startsWith('.');

/**
 * Baut den Index über alle Fächer unter `root`. Mit `fix` werden fehlende IDs
 * ergänzt und die betroffenen Dateien zurückgeschrieben (vor dem Index-Bau).
 */
export async function buildIndex(
  root: string,
  opts: { fix: boolean; now?: Date },
): Promise<{ index: LernIndex; changedFiles: string[] }> {
  const subjectDirs = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !isHidden(d.name) && existsSync(join(root, d.name, `${d.name}.md`)))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'de'));

  const filesBySubject = new Map<string, TopicFile[]>();
  const probenBySubject = new Map<string, ProbeFile[]>();
  for (const s of subjectDirs) {
    filesBySubject.set(s, await readTopicFiles(root, s));
    probenBySubject.set(s, await readProbeFiles(root, s));
  }
  const all = [...filesBySubject.values()].flat();
  const allProben = [...probenBySubject.values()].flat();

  const changedFiles: string[] = [];
  if (opts.fix) {
    const taken = new Set<string>();
    for (const f of all) for (const it of [...f.topic.karten, ...f.topic.uebungen]) if (it.id) taken.add(it.id);
    for (const f of allProben) for (const it of f.probe.aufgaben) if (it.id) taken.add(it.id);
    for (const f of all) {
      const before = f.bytes.toString('utf8');
      const { text, added } = ensureIds(before, taken);
      if (added.length === 0) continue;
      f.bytes = Buffer.from(text, 'utf8');
      f.topic = parseTopic(text);
      await writeFile(join(root, ...f.pfad.split('/')), f.bytes);
      changedFiles.push(f.pfad);
    }
    for (const f of allProben) {
      const { text, added } = ensureIds(f.bytes.toString('utf8'), taken, 'probe');
      if (added.length === 0) continue;
      f.bytes = Buffer.from(text, 'utf8');
      f.probe = parseProbe(text);
      await writeFile(join(root, ...f.pfad.split('/')), f.bytes);
      changedFiles.push(f.pfad);
    }
  }

  const dupErrors = new Map<string, string[]>(); // pfad → Fehler
  const idQuellen = [
    ...all.map((f) => ({ pfad: f.pfad, topic: f.topic })),
    ...allProben.map((f) => ({ pfad: f.pfad, topic: probeInhalt(f.probe) })),
  ];
  for (const [id, places] of findDuplicateIds(idQuellen)) {
    for (const p of new Set(places.map((pl) => pl.replace(/:\d+$/, '')))) {
      const list = dupErrors.get(p) ?? [];
      list.push(`ID ${id} doppelt (${places.join(', ')})`);
      dupErrors.set(p, list);
    }
  }

  // Proben-IDs müssen eindeutig sein, auch gegenüber Themen-IDs (Ergebnisse hängen an `probe:<id>`).
  const dateiIds = new Map<string, string[]>(); // id → Pfade
  for (const f of all) if (f.topic.id) dateiIds.set(f.topic.id, [...(dateiIds.get(f.topic.id) ?? []), f.pfad]);
  for (const f of allProben) if (f.probe.id) dateiIds.set(f.probe.id, [...(dateiIds.get(f.probe.id) ?? []), f.pfad]);
  const probenPfade = new Set(allProben.map((f) => f.pfad));
  for (const [id, pfade] of dateiIds) {
    if (pfade.length < 2 || !pfade.some((x) => probenPfade.has(x))) continue;
    for (const x of pfade) dupErrors.set(x, [...(dupErrors.get(x) ?? []), `Probe-ID ${id} doppelt (${pfade.join(', ')})`]);
  }

  const toIndexTopic = (f: TopicFile, titel?: string): IndexTopic => ({
    id: f.topic.id || null,
    titel: titel ?? (f.topic.titel || f.datei),
    pfad: f.pfad,
    hash: gitBlobSha(f.bytes),
    karten: f.topic.karten.filter((k) => !k.zurueckgezogen).length,
    uebungen: f.topic.uebungen.filter((u) => !u.zurueckgezogen).length,
    hatMindmap: f.topic.mindmap !== null,
    fehler: [...f.topic.fehler, ...(dupErrors.get(f.pfad) ?? [])],
  });

  const toIndexProbe = (f: ProbeFile): IndexProbe => {
    const aktiv = f.probe.aufgaben.filter((a) => !a.zurueckgezogen);
    return {
      id: f.probe.id || null,
      titel: f.probe.titel || f.pfad.slice(f.pfad.lastIndexOf('/') + 1, -3),
      pfad: f.pfad,
      hash: gitBlobSha(f.bytes),
      aufgaben: aktiv.length,
      punkte: aktiv.reduce((n, a) => n + (a.punkte ?? 0), 0),
      dauerMin: f.probe.dauerMin,
      fehler: [...f.probe.fehler, ...(dupErrors.get(f.pfad) ?? [])],
    };
  };

  const faecher: IndexSubject[] = [];
  for (const dir of subjectDirs) {
    const subjectPath = `${dir}/${dir}.md`;
    const bytes = await readFile(join(root, dir, `${dir}.md`));
    const subject = parseSubject(bytes.toString('utf8'));
    const files = filesBySubject.get(dir) ?? [];
    const used = new Set<string>();
    const kapitel: IndexChapter[] = subject.kapitel.map((k) => ({
      ordner: k.ordner,
      titel: k.titel,
      themen: k.themen.map((ref) => {
        const f = files.find((x) => x.ordner === k.ordner && x.datei === ref.datei);
        if (!f) {
          return { id: null, titel: ref.titel, pfad: null, hash: null, karten: 0, uebungen: 0, hatMindmap: false, fehler: [] };
        }
        used.add(f.pfad);
        return toIndexTopic(f, ref.titel);
      }),
    }));
    faecher.push({
      id: subject.id,
      name: subject.name,
      kuerzel: subject.kuerzel,
      farbe: subject.farbe,
      struktur: subject.struktur,
      pfad: subjectPath,
      hash: gitBlobSha(bytes),
      kapitel,
      nichtZugeordnet: files.filter((f) => !used.has(f.pfad)).map((f) => toIndexTopic(f)),
      proben: (probenBySubject.get(dir) ?? []).map(toIndexProbe).sort((a, b) => a.titel.localeCompare(b.titel, 'de')),
      fehler: subject.fehler,
    });
  }

  const rueckfragen = await countMarkdown(join(root, '_rueckfrage'));
  const fehlerAnzahl = faecher.reduce(
    (n, s) =>
      n + s.fehler.length +
      [...s.kapitel.flatMap((k) => k.themen), ...s.nichtZugeordnet, ...s.proben].reduce((m, t) => m + t.fehler.length, 0),
    0,
  );

  return {
    index: { version: 1, erstellt: (opts.now ?? new Date()).toISOString(), faecher, rueckfragen, fehlerAnzahl },
    changedFiles,
  };
}

async function readTopicFiles(root: string, subjectDir: string): Promise<TopicFile[]> {
  const out: TopicFile[] = [];
  const chapters = (await readdir(join(root, subjectDir), { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !isHidden(d.name))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'de'));
  for (const ordner of chapters) {
    const names = (await readdir(join(root, subjectDir, ordner), { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, 'de'));
    for (const name of names) {
      const bytes = await readFile(join(root, subjectDir, ordner, name));
      out.push({
        pfad: `${subjectDir}/${ordner}/${name}`,
        ordner,
        datei: name.slice(0, -3),
        bytes,
        topic: parseTopic(bytes.toString('utf8')),
      });
    }
  }
  return out;
}

async function readProbeFiles(root: string, subjectDir: string): Promise<ProbeFile[]> {
  const dir = join(root, subjectDir, PROBEN_ORDNER);
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'de'));
  const out: ProbeFile[] = [];
  for (const name of names) {
    const bytes = await readFile(join(dir, name));
    out.push({ pfad: `${subjectDir}/${PROBEN_ORDNER}/${name}`, bytes, probe: parseProbe(bytes.toString('utf8')) });
  }
  return out;
}

async function countMarkdown(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  return (await readdir(dir)).filter((n) => n.endsWith('.md')).length;
}
