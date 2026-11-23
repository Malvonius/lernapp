import { GitHubError, type GitHubClient } from './github';

/** Größte erlaubte Datei (die Contents-API nimmt bis 100 MB, Base64 bläht um ein Drittel auf; am Handy sind 25 MB die sinnvolle Grenze). */
export const MAX_BYTES = 25 * 1024 * 1024;
export const ERLAUBTE_ENDUNGEN = ['pdf', 'docx', 'doc', 'odt', 'pptx', 'ppt', 'xlsx', 'png', 'jpg', 'jpeg', 'heic', 'zip', 'txt', 'md'] as const;
/** Für das `accept`-Attribut der Dateiauswahl */
export const ACCEPT = ERLAUBTE_ENDUNGEN.map((e) => `.${e}`).join(',');

const INBOX = '_inbox';
const RUECKFRAGE = '_rueckfrage';
const MAX_NAME = 120;
const MAX_ENDUNG = 12;
const MAX_VERSUCHE = 25;

const endungVon = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

/** Fehlertext oder null, wenn die Datei hochgeladen werden darf. */
export function pruefeDatei(name: string, groesse: number): string | null {
  if (!(ERLAUBTE_ENDUNGEN as readonly string[]).includes(endungVon(name))) {
    return `Dateityp nicht erlaubt (erlaubt: ${ERLAUBTE_ENDUNGEN.join(', ')}).`;
  }
  if (groesse <= 0) return 'Die Datei ist leer.';
  if (groesse > MAX_BYTES) return 'Die Datei ist größer als 25 MB.';
  return null;
}

/** Wiener Ortszeit als YYYYMMDD-HHMMSS */
function zeitstempel(jetzt: Date): string {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Vienna',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(jetzt)
      .map((t) => [t.type, t.value]),
  );
  return `${teile.year}${teile.month}${teile.day}-${teile.hour}${teile.minute}${teile.second}`;
}

/** Entfernt Pfadtrenner, Steuer- und Sonderzeichen sowie „..“; trennt Endung ab. */
function saubererName(name: string): { basis: string; endung: string } {
  let s = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '');
  while (s.includes('..')) s = s.replaceAll('..', '');
  s = s.trim();
  const i = s.lastIndexOf('.');
  let basis = i >= 0 ? s.slice(0, i) : s;
  let endung = i >= 0 ? s.slice(i).trim().slice(0, MAX_ENDUNG) : '';
  if (endung === '.') endung = '';
  basis = basis.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (!basis) basis = 'datei';
  return { basis: basis.slice(0, Math.max(1, MAX_NAME - endung.length)), endung };
}

function pfadFuer(stamp: string, basis: string, endung: string, nr: number): string {
  const suffix = nr > 1 ? `-${nr}` : '';
  const b = basis.slice(0, Math.max(1, MAX_NAME - endung.length - suffix.length));
  return `${INBOX}/${stamp}_${b}${suffix}${endung}`;
}

/** `_inbox/<YYYYMMDD-HHMMSS>_<sicherer Name>`: nie außerhalb von _inbox/. */
export function inboxPfad(name: string, jetzt: Date): string {
  const { basis, endung } = saubererName(name);
  return pfadFuer(zeitstempel(jetzt), basis, endung, 1);
}

/** Datei hochgeladen, aber der Hinweis (.meta.json) nicht. */
export class UploadFehler extends Error {
  teil: 'meta';
  pfad: string;
  constructor(teil: 'meta', pfad: string, message: string) {
    super(message);
    this.name = 'UploadFehler';
    this.teil = teil;
    this.pfad = pfad;
  }
}

export interface UploadMeta {
  fach: string | null;
  wunsch: string | null;
}

/**
 * Lädt die Datei nach `_inbox/` und danach `<Datei>.meta.json`. Überschreibt nie etwas (Suffix -2, -3 …).
 * Scheitert nur der Hinweis, bleibt die Datei liegen und es kommt ein UploadFehler.
 */
export async function ladeHoch(
  client: GitHubClient,
  datei: { name: string; bytes: Uint8Array },
  meta: UploadMeta,
  geraet: string,
  jetzt: Date,
): Promise<{ pfad: string }> {
  const problem = pruefeDatei(datei.name, datei.bytes.length);
  if (problem) throw new Error(problem);

  const { basis, endung } = saubererName(datei.name);
  const stamp = zeitstempel(jetzt);
  const vorhanden = new Set(await client.listDir(INBOX));

  let pfad = '';
  let nr = 1;
  for (let versuch = 0; ; versuch++) {
    while (vorhanden.has(pfadFuer(stamp, basis, endung, nr).slice(INBOX.length + 1))) nr++;
    pfad = pfadFuer(stamp, basis, endung, nr);
    try {
      await client.putBinary(pfad, datei.bytes, null, `inbox: ${pfad.slice(INBOX.length + 1)}`);
      break;
    } catch (e) {
      // Name inzwischen vergeben (veraltete Liste, zweites Gerät): nächsten Suffix probieren, nie überschreiben
      if (e instanceof GitHubError && e.kind === 'conflict' && versuch < MAX_VERSUCHE) {
        vorhanden.add(pfad.slice(INBOX.length + 1));
        continue;
      }
      throw e;
    }
  }

  const inhalt = {
    fach: meta.fach || null,
    wunsch: meta.wunsch?.trim() || null,
    hochgeladen: jetzt.toISOString(),
    geraet,
  };
  try {
    await client.putFile(`${pfad}.meta.json`, `${JSON.stringify(inhalt, null, 2)}\n`, null, `inbox: Hinweis zu ${pfad.slice(INBOX.length + 1)}`);
  } catch {
    throw new UploadFehler(
      'meta',
      pfad,
      'Die Datei ist hochgeladen, aber Fach und Wunsch nicht. Bitte nochmal versuchen oder Bob die Angaben im Chat sagen.',
    );
  }
  return { pfad };
}

/** Dateien, die in `_inbox/` auf Bob warten (ohne Hinweisdateien und .gitkeep). */
export async function inboxListe(client: GitHubClient): Promise<string[]> {
  return (await client.listDir(INBOX)).filter((n) => !n.endsWith('.meta.json') && n !== '.gitkeep').sort();
}

/** Offene Rückfragen von Bob: `_rueckfrage/*.md`. */
export async function rueckfragenListe(client: GitHubClient): Promise<string[]> {
  return (await client.listDir(RUECKFRAGE)).filter((n) => n.endsWith('.md')).sort();
}
