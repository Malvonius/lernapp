import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Card, Exercise, IndexSubject, IndexTopic, Topic } from '../../format/types';
import { useAppData } from '../../state/AppData';
import { AskBobButton } from '../components/AskBobButton';
import { Markdown } from '../components/Markdown';
import { Mindmap } from '../components/Mindmap';
import { Uebung } from '../components/Uebung';

type Reiter = 'text' | 'karten' | 'mindmap' | 'uebungen';

function findeThema(fach: IndexSubject | undefined, themaId: string | undefined): IndexTopic | null {
  if (!fach || !themaId) return null;
  const alle = [...fach.kapitel.flatMap((k) => k.themen), ...fach.nichtZugeordnet];
  return alle.find((t) => t.id === themaId) ?? null;
}

function KartenListe({ karten }: { karten: Card[] }) {
  const [offen, setOffen] = useState<Set<number>>(new Set());
  const umschalten = (i: number) =>
    setOffen((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(i)) neu.add(i);
      return neu;
    });
  if (karten.length === 0) return <p className="lead">Keine Karten in diesem Thema.</p>;
  return (
    <ol className="karten-liste">
      {karten.map((k, i) => (
        <li key={k.id ?? i} className="karte-eintrag">
          <div className="karte-eintrag__frage">
            <Markdown text={k.frage} />
          </div>
          {offen.has(i) ? (
            <div className="karte-eintrag__antwort">
              <Markdown text={k.antwort} />
            </div>
          ) : null}
          <button type="button" className="button button--quiet" aria-expanded={offen.has(i)} onClick={() => umschalten(i)}>
            {offen.has(i) ? 'Antwort verbergen' : 'Antwort zeigen'}
          </button>
        </li>
      ))}
    </ol>
  );
}

function UebungenListe({ uebungen, fach, topic }: { uebungen: Exercise[]; fach: string; topic: Topic }) {
  if (uebungen.length === 0) return <p className="lead">Keine Übungen in diesem Thema.</p>;
  return (
    <ol className="uebungen-liste">
      {uebungen.map((u, i) => (
        <li key={u.id ?? `zeile-${u.zeile}-${i}`}>
          <Uebung
            ex={u}
            aktion={({ element }) => (
              <AskBobButton fach={fach} thema={topic.titel} zusammenfassung={topic.zusammenfassung} element={element} />
            )}
          />
        </li>
      ))}
    </ol>
  );
}

function ThemaInhalt({ fachId, fachName, themaId, topic, kopfAktion }: { fachId: string; fachName: string; themaId: string; topic: Topic; kopfAktion?: ReactNode }) {
  const aktive = topic.karten.filter((k) => !k.zurueckgezogen);
  const aktiveUebungen = topic.uebungen.filter((u) => !u.zurueckgezogen);
  const reiter: { id: Reiter; label: string }[] = [
    { id: 'text', label: 'Text' },
    { id: 'karten', label: 'Karten' },
    ...(topic.mindmap ? [{ id: 'mindmap' as const, label: 'Mindmap' }] : []),
    { id: 'uebungen', label: 'Übungen' },
  ];
  const [aktiv, setAktiv] = useState<Reiter>('text');

  return (
    <>
      <h1 className="fach-titel">{topic.titel}</h1>
      <div className="thema-aktionen">
        <Link
          className="button"
          to={`/wiederholen?fach=${encodeURIComponent(fachId)}&thema=${encodeURIComponent(themaId)}`}
        >
          Dieses Thema wiederholen
        </Link>
        <AskBobButton fach={fachName} thema={topic.titel} zusammenfassung={topic.zusammenfassung} />
        {kopfAktion}
      </div>
      <div role="tablist" aria-label="Themenansicht" className="reiter">
        {reiter.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            id={`reiter-${r.id}`}
            aria-selected={aktiv === r.id}
            aria-controls={aktiv === r.id ? `feld-${r.id}` : undefined}
            className="reiter__knopf"
            onClick={() => setAktiv(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`feld-${aktiv}`} aria-labelledby={`reiter-${aktiv}`} className="reiter__feld">
        {aktiv === 'text' &&
          (topic.zusammenfassung.trim() ? <Markdown text={topic.zusammenfassung} /> : <p className="lead">Noch keine Zusammenfassung.</p>)}
        {aktiv === 'karten' && <KartenListe karten={aktive} />}
        {aktiv === 'mindmap' && topic.mindmap && <Mindmap root={topic.mindmap} />}
        {aktiv === 'uebungen' && <UebungenListe uebungen={aktiveUebungen} fach={fachName} topic={topic} />}
      </div>
    </>
  );
}

/**
 * Themenansicht. `kopfAktion` ist der Slot neben „Dieses Thema wiederholen“
 * (Task 12 setzt hier den „Frag Bob“-Knopf ein); ohne Angabe bleibt er leer.
 */
export function Thema({ kopfAktion }: { kopfAktion?: ReactNode } = {}) {
  const { fachId, themaId } = useParams();
  const { index, topics } = useAppData();
  const fach = index?.faecher.find((f) => f.id === fachId);
  const eintrag = findeThema(fach, themaId);
  const topic = eintrag?.pfad ? topics(eintrag.pfad) : null;

  return (
    <section className="screen" style={fach ? ({ '--fach': fach.farbe } as CSSProperties) : undefined}>
      {topic && fachId && themaId ? (
        <ThemaInhalt key={themaId} fachId={fachId} fachName={fach?.name ?? fachId} themaId={themaId} topic={topic} kopfAktion={kopfAktion} />
      ) : eintrag ? (
        <p className="lead" aria-busy="true">Thema wird geladen …</p>
      ) : index ? (
        <>
          <h1>Thema nicht gefunden</h1>
          <p>
            <Link to={fach ? `/fach/${encodeURIComponent(fach.id)}` : '/'}>{fach ? `Zurück zu ${fach.name}` : 'Zur Startseite'}</Link>
          </p>
        </>
      ) : (
        <p className="lead">Lernstoff wird geladen …</p>
      )}
    </section>
  );
}
