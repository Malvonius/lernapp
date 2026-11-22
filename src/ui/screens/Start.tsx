import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { IndexSubject } from '../../format/types';
import { aktiveKartenIds, themenPfade, useAppData } from '../../state/AppData';
import { SyncBanner } from '../components/SyncBanner';

interface Anteil {
  sitzt: number;
  faellig: number;
  neu: number;
}

function FachKachel({ fach, faelligSet }: { fach: IndexSubject; faelligSet: Set<string> }) {
  const { topics, kartenZustand } = useAppData();
  const pfade = themenPfade(fach);
  const ids = pfade.flatMap((p) => {
    const t = topics(p);
    return t ? aktiveKartenIds(t) : [];
  });
  const anteil: Anteil = { sitzt: 0, faellig: 0, neu: 0 };
  for (const id of ids) {
    if (!kartenZustand.has(id)) anteil.neu++;
    else if (faelligSet.has(id)) anteil.faellig++;
    else anteil.sitzt++;
  }
  const faelligHier = ids.filter((id) => faelligSet.has(id)).length;
  const gesamt = ids.length || 1;
  const pct = (x: number) => `${(x / gesamt) * 100}%`;

  return (
    <li>
      <Link to={`/fach/${encodeURIComponent(fach.id)}`} className="kachel" style={{ '--fach': fach.farbe } as CSSProperties}>
        <span className="kachel__name">{fach.name}</span>
        <span className="kachel__info">
          {pfade.length} {pfade.length === 1 ? 'Thema' : 'Themen'} · {faelligHier} fällig
        </span>
        {ids.length > 0 && (
          <span className="ampel-anteil" aria-label={`${anteil.sitzt} sitzen, ${anteil.faellig} fällig, ${anteil.neu} neu`}>
            <span className="ampel-anteil__gruen" style={{ width: pct(anteil.sitzt) }} />
            <span className="ampel-anteil__gelb" style={{ width: pct(anteil.faellig) }} />
            <span className="ampel-anteil__grau" style={{ width: pct(anteil.neu) }} />
          </span>
        )}
      </Link>
    </li>
  );
}

export function Start() {
  const { index, faellig, syncStatus } = useAppData();
  const faelligSet = new Set(faellig);

  return (
    <section className="screen" aria-labelledby="start-h">
      <h1 id="start-h" className="visually-hidden">Start</h1>
      <SyncBanner />
      {index ? (
        <>
          <div className="start-aktionen">
            <Link to="/wiederholen" className="cta">
              Jetzt wiederholen ({faellig.length} fällig)
            </Link>
            <Link to="/pruefung" className="button button--quiet start-pruefung">
              Prüfung starten
            </Link>
          </div>
          <h2>Fächer</h2>
          <ul className="kacheln">
            {index.faecher.map((f) => (
              <FachKachel key={f.id} fach={f} faelligSet={faelligSet} />
            ))}
          </ul>
        </>
      ) : (
        syncStatus.laeuft && <p className="lead">Lernstoff wird geladen …</p>
      )}
    </section>
  );
}
