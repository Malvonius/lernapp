import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { GitHubError } from '../../lib/github';
import { ACCEPT, inboxListe, ladeHoch, pruefeDatei, rueckfragenListe, UploadFehler } from '../../lib/upload';
import { useAppData } from '../../state/AppData';
import { Markdown } from '../components/Markdown';
import { fehlerText, SyncBanner } from '../components/SyncBanner';

type Status = 'wartet' | 'laedt' | 'fertig' | 'fehler';

interface Eintrag {
  id: number;
  datei: File;
  status: Status;
  /** Fehlertext (bei `fehler`) */
  meldung?: string;
  /** Vor dem Upload abgelehnt (Typ/Größe): kein erneuter Versuch möglich */
  abgelehnt?: boolean;
}

const STATUS_TEXT: Record<Exclude<Status, 'fehler'>, string> = { wartet: 'wartet', laedt: 'lädt …', fertig: 'fertig' };

/** „3 B“, „2 KB“, „1,5 MB“ */
function groesse(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toLocaleString('de-AT', { maximumFractionDigits: 1 })} MB`;
}

const fehlerMeldung = (e: unknown): string => {
  if (e instanceof UploadFehler) return e.message;
  if (e instanceof GitHubError) {
    // Ein Token ohne Schreibrecht meldet GitHub oft als 404 oder 403
    if (e.kind === 'notfound' || e.kind === 'auth') return 'Token ungültig oder ohne Schreibrecht (Contents: Read and write)';
    return fehlerText(e, true);
  }
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
};

function Rueckfrage({ name }: { name: string }) {
  const { neuerClient } = useAppData();
  const [zustand, setZustand] = useState<{ art: 'leer' } | { art: 'laedt' } | { art: 'ok'; text: string } | { art: 'fehler'; text: string }>({ art: 'leer' });

  async function laden() {
    if (zustand.art === 'laedt' || zustand.art === 'ok') return;
    const client = neuerClient();
    if (!client) return;
    setZustand({ art: 'laedt' });
    try {
      const r = await client.getRaw(`_rueckfrage/${name}`);
      setZustand({ art: 'ok', text: r === 'unchanged' ? '' : r.text });
    } catch (e) {
      setZustand({ art: 'fehler', text: e instanceof GitHubError ? fehlerText(e, true) : 'Konnte nicht geladen werden.' });
    }
  }

  return (
    <details className="anleitung rueckfrage">
      <summary onClick={() => void laden()}>{name}</summary>
      {zustand.art === 'laedt' && <p>Lädt …</p>}
      {zustand.art === 'fehler' && <p role="alert">{zustand.text}</p>}
      {zustand.art === 'ok' && (
        <div className="rueckfrage__text">
          <Markdown text={zustand.text} />
        </div>
      )}
    </details>
  );
}

/** Unterlagen in die Inbox hochladen, Wartende und Rückfragen von Bob ansehen. */
export function Hochladen() {
  const { index, geraet, syncStatus, neuerClient } = useAppData();
  const { hash } = useLocation();
  const id = useId();
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [fach, setFach] = useState('');
  const [wunsch, setWunsch] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [wartend, setWartend] = useState<{ art: 'laedt' } | { art: 'ok'; namen: string[] } | { art: 'fehler' }>({ art: 'laedt' });
  const [fragen, setFragen] = useState<{ art: 'laedt' } | { art: 'ok'; namen: string[] } | { art: 'fehler' }>({ art: 'laedt' });
  const naechsteId = useRef(0);
  const rueckfragenRef = useRef<HTMLElement>(null);
  const offline = syncStatus.offline;

  const listenLaden = useCallback(async () => {
    const client = neuerClient();
    if (!client) return;
    const [w, r] = await Promise.allSettled([inboxListe(client), rueckfragenListe(client)]);
    setWartend(w.status === 'fulfilled' ? { art: 'ok', namen: w.value } : { art: 'fehler' });
    setFragen(r.status === 'fulfilled' ? { art: 'ok', namen: r.value } : { art: 'fehler' });
  }, [neuerClient]);

  useEffect(() => {
    if (offline) return;
    void listenLaden();
  }, [listenLaden, offline]);

  // Link „N Rückfragen von Bob“ (…#rueckfragen) springt zum Abschnitt, sobald er da ist
  useEffect(() => {
    if (hash === '#rueckfragen') rueckfragenRef.current?.scrollIntoView?.({ block: 'start' });
  }, [hash, fragen.art]);

  function dateienHinzu(ev: ChangeEvent<HTMLInputElement>) {
    const neu = Array.from(ev.target.files ?? []);
    ev.target.value = ''; // dieselbe Datei darf erneut gewählt werden
    if (neu.length === 0) return;
    setEintraege((alt) => [
      ...alt,
      ...neu.map((datei): Eintrag => {
        const problem = pruefeDatei(datei.name, datei.size);
        return { id: naechsteId.current++, datei, status: problem ? 'fehler' : 'wartet', meldung: problem ?? undefined, abgelehnt: problem !== null };
      }),
    ]);
  }

  const entfernen = (eid: number) => setEintraege((alt) => alt.filter((e) => e.id !== eid));
  const setze = (eid: number, teil: Partial<Eintrag>) => setEintraege((alt) => alt.map((e) => (e.id === eid ? { ...e, ...teil } : e)));

  const offen = eintraege.filter((e) => !e.abgelehnt && e.status !== 'fertig' && e.status !== 'laedt');
  const kannHochladen = !offline && !laeuft && offen.length > 0;

  async function hochladen() {
    const client = neuerClient();
    if (!client || !kannHochladen) return;
    setLaeuft(true);
    // nacheinander: ein Handy-Netz verträgt keine drei 25-MB-Uploads gleichzeitig
    for (const e of offen) {
      setze(e.id, { status: 'laedt', meldung: undefined });
      try {
        const bytes = new Uint8Array(await e.datei.arrayBuffer());
        await ladeHoch(client, { name: e.datei.name, bytes }, { fach: fach || null, wunsch: wunsch.trim() || null }, geraet ?? 'pc', new Date());
        setze(e.id, { status: 'fertig' });
      } catch (err) {
        setze(e.id, { status: 'fehler', meldung: fehlerMeldung(err) });
      }
    }
    setLaeuft(false);
    void listenLaden();
  }

  const ids = { dateien: `${id}-dateien`, kamera: `${id}-kamera`, fach: `${id}-fach`, wunsch: `${id}-wunsch` };

  return (
    <section className="screen" aria-labelledby={`${id}-h`}>
      <h1 id={`${id}-h`}>Hochladen</h1>
      <SyncBanner />
      <p className="lead">Schick Unterlagen an Bob. Sie landen in der Inbox, Bob wandelt sie um, sobald du es ihm im Chat sagst.</p>
      {offline && (
        <div className="banner" role="status">
          Offline: Hochladen geht erst wieder mit Verbindung.
        </div>
      )}

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void hochladen();
        }}
      >
        <div className="datei-wahl">
          <input id={ids.dateien} className="visually-hidden" type="file" multiple accept={ACCEPT} onChange={dateienHinzu} />
          <label htmlFor={ids.dateien} className="button button--quiet">
            Dateien auswählen
          </label>
          <input id={ids.kamera} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={dateienHinzu} />
          <label htmlFor={ids.kamera} className="button button--quiet">
            Foto aufnehmen
          </label>
        </div>
        <p className="hint datei-wahl__hinweis">PDF, Word, PowerPoint, Excel, Fotos, ZIP oder Text, je höchstens 25 MB.</p>

        {eintraege.length > 0 && (
          <ul className="datei-liste" aria-label="Ausgewählte Dateien">
            {eintraege.map((e) => (
              <li key={e.id} className="datei" data-status={e.status}>
                <span className="datei__name">{e.datei.name}</span>
                <span className="datei__groesse">{groesse(e.datei.size)}</span>
                <span className="datei__status" role="status" aria-live="polite">
                  {e.status === 'fehler' ? `Fehler: ${e.meldung ?? ''}` : STATUS_TEXT[e.status]}
                </span>
                {(e.status === 'wartet' || e.status === 'fehler') && (
                  <button type="button" className="button button--quiet datei__weg" onClick={() => entfernen(e.id)} aria-label={`${e.datei.name} entfernen`}>
                    Entfernen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="field">
          <label htmlFor={ids.fach}>Fach</label>
          <select id={ids.fach} value={fach} onChange={(e) => setFach(e.target.value)}>
            <option value="">Bob entscheidet</option>
            {index?.faecher.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.wunsch}>Wunsch (optional)</label>
          <input
            id={ids.wunsch}
            className="input"
            type="text"
            autoComplete="off"
            maxLength={300}
            placeholder="z. B. mehr Übungen"
            value={wunsch}
            onChange={(e) => setWunsch(e.target.value)}
          />
        </div>

        <button type="submit" className="button" disabled={!kannHochladen}>
          Hochladen
        </button>
      </form>

      <section aria-labelledby={`${id}-wartet`}>
        <h2 id={`${id}-wartet`} className="abschnitt-titel">Wartet auf Bob</h2>
        {wartend.art === 'laedt' && !offline && <p className="lead">Lädt …</p>}
        {(wartend.art === 'fehler' || (offline && wartend.art === 'laedt')) && <p className="lead">Liste gerade nicht verfügbar.</p>}
        {wartend.art === 'ok' &&
          (wartend.namen.length === 0 ? (
            <p className="lead">Nichts offen.</p>
          ) : (
            <>
              <ul className="datei-liste">
                {wartend.namen.map((n) => (
                  <li key={n} className="datei">
                    <span className="datei__name">{n}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">Sag Bob im Chat: „Verarbeite die Inbox“.</p>
            </>
          ))}
      </section>

      <section id="rueckfragen" ref={rueckfragenRef} aria-labelledby={`${id}-fragen`}>
        <h2 id={`${id}-fragen`} className="abschnitt-titel">Rückfragen von Bob</h2>
        {fragen.art === 'laedt' && !offline && <p className="lead">Lädt …</p>}
        {(fragen.art === 'fehler' || (offline && fragen.art === 'laedt')) && <p className="lead">Liste gerade nicht verfügbar.</p>}
        {fragen.art === 'ok' &&
          (fragen.namen.length === 0 ? (
            <p className="lead">Keine offenen Rückfragen.</p>
          ) : (
            fragen.namen.map((n) => <Rueckfrage key={n} name={n} />)
          ))}
      </section>
    </section>
  );
}
