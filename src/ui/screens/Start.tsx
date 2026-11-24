import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { IndexSubject } from '../../format/types';
import { MAX_NEUE_PRO_SITZUNG } from './Wiederholen';
import { aktiveKartenIds, aktiveUebungIds, themenPfade, useAppData } from '../../state/AppData';
import { fachStatus, STATUS_REIHE, type Status } from '../../lib/status';
import { STATUS_LABEL } from '../components/Ampel';
import { Glut } from '../components/Glut';
import { SyncBanner } from '../components/SyncBanner';

function FachKachel({ fach, faelligSet, nr }: { fach: IndexSubject; faelligSet: Set<string>; nr: number }) {
  const { topics, kartenZustand, uebungsStand, jetzt } = useAppData();
  const pfade = themenPfade(fach);
  const kartenIds = (pfad: string) => {
    const t = topics(pfad);
    return t ? aktiveKartenIds(t) : [];
  };
  const faelligHier = pfade.flatMap(kartenIds).filter((id) => faelligSet.has(id)).length;
  // Anteil der Themen je Status, dieselbe Rechnung wie in der Fachansicht
  const uebungIds = (pfad: string) => {
    const t = topics(pfad);
    return t ? aktiveUebungIds(t) : [];
  };
  const stati = fachStatus(fach, kartenIds, kartenZustand, jetzt, { ids: uebungIds, stand: uebungsStand });
  const anzahl = (s: Status) => stati.filter((x) => x === s).length;
  const gesamt = stati.length || 1;

  return (
    <li className="gestaffelt" style={{ '--i': nr } as CSSProperties}>
      <Link to={`/fach/${encodeURIComponent(fach.id)}`} className="kachel" style={{ '--fach': fach.farbe } as CSSProperties}>
        <span className="kachel__name">{fach.name}</span>
        <span className="kachel__info">
          {pfade.length} {pfade.length === 1 ? 'Thema' : 'Themen'} · {faelligHier} fällig
        </span>
        {stati.length > 0 && (
          <span
            className="ampel-anteil"
            role="img"
            aria-label={STATUS_REIHE.filter((s) => anzahl(s) > 0).map((s) => `${anzahl(s)} ${STATUS_LABEL[s]}`).join(', ')}
          >
            {STATUS_REIHE.map((s) => (
              <span key={s} className={`ampel-anteil__${s}`} style={{ width: `${(anzahl(s) / gesamt) * 100}%` }} />
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}

export function Start() {
  const { index, faellig, kartenZustand, syncStatus } = useAppData();
  const rueckfragen = index?.rueckfragen ?? 0;
  const faelligSet = new Set(faellig);
  // faellig enthält auch neue Karten (ohne Ereignis); die zählen getrennt, höchstens 20 pro Sitzung
  const neu = faellig.filter((id) => !kartenZustand.has(id)).length;
  const ueberfaellig = faellig.length - neu;

  return (
    <section className="screen screen--start" aria-labelledby="start-h">
      <h1 id="start-h" className="visually-hidden">Start</h1>
      <SyncBanner />
      {index ? (
        <>
          <Glut />
          <div className="start-aktionen">
            <Link to="/wiederholen" className="cta">
              <span className="cta__titel">Jetzt wiederholen</span>{' '}
              <span className="cta__info">
                <span className="visually-hidden">(</span>
                {ueberfaellig} fällig · {Math.min(neu, MAX_NEUE_PRO_SITZUNG)} neu
                <span className="visually-hidden">)</span>
              </span>
            </Link>
            <Link to="/pruefung" className="button button--quiet start-pruefung">
              Prüfung starten
            </Link>
          </div>
          <div className="start-zusatz">
            <Link to="/hochladen" className="button button--quiet">
              Unterlagen hochladen
            </Link>
            <Link to="/statistik" className="button button--quiet">
              Statistik
            </Link>
            {rueckfragen > 0 && (
              <Link to="/hochladen#rueckfragen" className="rueckfrage-hinweis">
                {rueckfragen} {rueckfragen === 1 ? 'Rückfrage' : 'Rückfragen'} von Bob
              </Link>
            )}
          </div>
          <h2 className="abschnitt-titel">Fächer</h2>
          <ul className="kacheln">
            {index.faecher.map((f, i) => (
              <FachKachel key={f.id} fach={f} faelligSet={faelligSet} nr={i} />
            ))}
          </ul>
        </>
      ) : (
        syncStatus.laeuft && <p className="lead">Lernstoff wird geladen …</p>
      )}
    </section>
  );
}
