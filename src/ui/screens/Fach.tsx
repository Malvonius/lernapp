import { useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { IndexProbe, IndexSubject, IndexTopic } from '../../format/types';
import { formatPunkte, letztesErgebnis } from '../../lib/probe';
import { aktiveKartenIds, aktiveUebungIds, useAppData } from '../../state/AppData';
import { kapitelStatus, themaStatus, type Status } from '../../lib/status';
import { Ampel } from '../components/Ampel';
import { SyncBanner } from '../components/SyncBanner';

const FEHLER_HINWEIS = 'Datei hat Formatfehler, Bob korrigiert das';

function ThemaZeile({ fachId, t, status }: { fachId: string; t: IndexTopic; status: Status }) {
  const [offen, setOffen] = useState(false);
  const zahlen = `${t.karten} ${t.karten === 1 ? 'Karte' : 'Karten'} · ${t.uebungen} ${t.uebungen === 1 ? 'Übung' : 'Übungen'}`;

  if (status === 'luecke') {
    return (
      <li className="thema thema--luecke">
        <span className="thema__titel">{t.titel}</span>
        <span className="thema__info">noch keine Unterlagen</span>
        <Ampel status="luecke" />
      </li>
    );
  }
  if (status === 'fehlerhaft' || !t.id) {
    return (
      <li className="thema thema--fehlerhaft">
        <button
          type="button"
          className="thema__knopf"
          aria-expanded={offen}
          title={FEHLER_HINWEIS}
          onClick={() => setOffen((o) => !o)}
        >
          <span className="thema__titel">{t.titel}</span>
          <Ampel status="fehlerhaft" />
        </button>
        {offen && <p className="thema__hinweis">{FEHLER_HINWEIS}</p>}
      </li>
    );
  }
  return (
    <li className="thema">
      <Link to={`/thema/${encodeURIComponent(fachId)}/${encodeURIComponent(t.id)}`} className="thema__link">
        <span className="thema__titel">{t.titel}</span>
        <span className="thema__info">{zahlen}</span>
        <Ampel status={status} />
      </Link>
    </li>
  );
}

function ProbeZeile({ fachId, p }: { fachId: string; p: IndexProbe }) {
  const { ereignisse } = useAppData();
  const [offen, setOffen] = useState(false);
  if (p.fehler.length > 0 || !p.id) {
    return (
      <li className="thema thema--fehlerhaft">
        <button type="button" className="thema__knopf" aria-expanded={offen} title={FEHLER_HINWEIS} onClick={() => setOffen((o) => !o)}>
          <span className="thema__titel">{p.titel}</span>
          <Ampel status="fehlerhaft" />
        </button>
        {offen && <p className="thema__hinweis">{FEHLER_HINWEIS}</p>}
      </li>
    );
  }
  const letzte = letztesErgebnis(ereignisse, p.id);
  return (
    <li className="thema">
      <Link to={`/probe/${encodeURIComponent(fachId)}/${encodeURIComponent(p.id)}`} className="thema__link probe-zeile">
        <span className="thema__titel">{p.titel}</span>
        <span className="thema__info">
          {p.dauerMin} Min · {formatPunkte(p.punkte)} Punkte · {p.aufgaben} {p.aufgaben === 1 ? 'Aufgabe' : 'Aufgaben'}
        </span>
        <span className={letzte ? 'probe-zeile__ergebnis' : 'probe-zeile__ergebnis probe-zeile__ergebnis--leer'}>
          {letzte ? `Zuletzt ${formatPunkte(letzte.punkte)} von ${formatPunkte(letzte.max)}` : 'noch nicht geschrieben'}
        </span>
      </Link>
    </li>
  );
}

function FachInhalt({ fach }: { fach: IndexSubject }) {
  const { topics, kartenZustand, uebungsStand, jetzt } = useAppData();
  const status = (t: IndexTopic) => {
    const topic = t.pfad === null ? null : topics(t.pfad);
    return themaStatus(t, topic ? aktiveKartenIds(topic) : [], kartenZustand, jetzt, {
      ids: topic ? aktiveUebungIds(topic) : [],
      stand: uebungsStand,
    });
  };

  const abschnitt = (key: string, nr: number, titel: string, themen: IndexTopic[], mitAmpel: boolean) => {
    const stati = themen.map(status);
    return (
      <section key={key} className="kapitel gestaffelt" style={{ '--i': nr } as CSSProperties} aria-labelledby={`kap-${key}`}>
        <h2 id={`kap-${key}`} className="kapitel__titel">
          <span>{titel}</span>
          {mitAmpel && <Ampel status={kapitelStatus(stati)} />}
        </h2>
        <ul className="themen">
          {themen.map((t, i) => (
            <ThemaZeile key={`${t.pfad ?? t.titel}-${i}`} fachId={fach.id} t={t} status={stati[i]!} />
          ))}
        </ul>
      </section>
    );
  };

  return (
    <>
      <h1 className="fach-titel">{fach.name}</h1>
      {fach.struktur === 'vorlaeufig' && <p className="hinweis">vorläufige Gliederung</p>}
      {fach.kapitel.map((k, i) => abschnitt(`k${i}`, i, k.titel, k.themen, true))}
      {fach.nichtZugeordnet.length > 0 && abschnitt('nz', fach.kapitel.length, 'Nicht zugeordnet', fach.nichtZugeordnet, false)}
      {(fach.proben ?? []).length > 0 && (
        <section className="kapitel gestaffelt" style={{ '--i': fach.kapitel.length + 1 } as CSSProperties} aria-labelledby="kap-proben">
          <h2 id="kap-proben" className="kapitel__titel">
            <span>Probe-Schularbeiten</span>
          </h2>
          <ul className="themen">
            {fach.proben.map((p) => (
              <ProbeZeile key={p.pfad} fachId={fach.id} p={p} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function Fach() {
  const { fachId } = useParams();
  const { index, syncStatus } = useAppData();
  const fach = index?.faecher.find((f) => f.id === fachId);

  return (
    <section className={fach ? 'screen screen--fach' : 'screen'} style={fach ? ({ '--fach': fach.farbe } as CSSProperties) : undefined}>
      <SyncBanner />
      {fach ? (
        <FachInhalt fach={fach} />
      ) : index ? (
        <>
          <h1>Fach nicht gefunden</h1>
          <p><Link to="/">Zur Startseite</Link></p>
        </>
      ) : (
        <p className="lead">{syncStatus.laeuft ? 'Lernstoff wird geladen …' : 'Noch keine Lernstoff-Daten.'}</p>
      )}
    </section>
  );
}
