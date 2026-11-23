import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppData } from '../../state/AppData';
import { formatIntervall, vorschau, type Bewertung } from '../../lib/progress';
import { AskBobButton } from '../components/AskBobButton';
import { BEWERTUNGEN, Lernkarte } from '../components/Lernkarte';

export const MAX_NEUE_PRO_SITZUNG = 20;

interface KartenDaten {
  id: string;
  frage: string;
  antwort: string;
  farbe: string;
  fach: string;
  thema: string;
  zusammenfassung: string;
}

export interface WiederholenProps {
  /** Ersetzt den Standard-Knopf „Frag Bob“ auf jeder Karte */
  kartenAktion?: (karte: { id: string; frage: string; antwort: string }) => ReactNode;
}

export function Wiederholen({ kartenAktion }: WiederholenProps = {}) {
  const { index, topics, kartenZustand, jetzt, record, hochladen } = useAppData();
  const [params] = useSearchParams();
  const fachId = params.get('fach');
  const themaId = params.get('thema');

  // Alle aktiven Karten im Umfang der Query (Reihenfolge: Index).
  const karten = useMemo(() => {
    const m = new Map<string, KartenDaten>();
    for (const f of index?.faecher ?? []) {
      if (fachId && f.id !== fachId) continue;
      for (const t of [...f.kapitel.flatMap((k) => k.themen), ...f.nichtZugeordnet]) {
        if (!t.pfad || (themaId && t.id !== themaId)) continue;
        const topic = topics(t.pfad);
        for (const k of topic?.karten ?? []) {
          if (k.id && !k.zurueckgezogen) {
            m.set(k.id, {
              id: k.id,
              frage: k.frage,
              antwort: k.antwort,
              farbe: f.farbe,
              fach: f.name,
              thema: topic?.titel ?? t.titel,
              zusammenfassung: topic?.zusammenfassung ?? '',
            });
          }
        }
      }
    }
    return m;
  }, [index, topics, fachId, themaId]);

  // Die Warteschlange wird einmal beim Start der Sitzung gebaut und danach nur noch durch Bewerten verändert.
  const [queue, setQueue] = useState<string[] | null>(null);
  const [gesamt, setGesamt] = useState(0);
  const [verteilung, setVerteilung] = useState<Record<Bewertung, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [aufgedeckt, setAufgedeckt] = useState(false);
  const [fehler, setFehler] = useState(false);
  const beschaeftigt = useRef(false);

  // Sitzung verlassen oder beendet: Bewertungen gleich hochladen statt auf den Leerlauf-Timer zu warten.
  const hochladenRef = useRef(hochladen);
  hochladenRef.current = hochladen;
  useEffect(() => () => void hochladenRef.current(), []);
  const fertig = queue !== null && queue.length === 0;
  useEffect(() => {
    if (fertig) void hochladenRef.current();
  }, [fertig]);

  if (queue === null && index) {
    const ids = [...karten.keys()];
    const neu = ids.filter((id) => !kartenZustand.has(id)).slice(0, MAX_NEUE_PRO_SITZUNG);
    const mitFaelligkeit = ids.flatMap((id) => {
      const k = kartenZustand.get(id);
      return k ? [{ id, due: k.due.getTime() }] : [];
    });
    mitFaelligkeit.sort((a, b) => a.due - b.due);
    const faellig = mitFaelligkeit.filter((x) => x.due <= jetzt.getTime()).map((x) => x.id);
    // Thema-Modus („Durchlernen“): zusätzlich die noch nicht fälligen, nächste Fälligkeit zuerst
    const rest = themaId ? mitFaelligkeit.filter((x) => x.due > jetzt.getTime()).map((x) => x.id) : [];
    const start = [...faellig, ...neu, ...rest];
    setQueue(start);
    setGesamt(start.length);
  }

  if (!index || queue === null) {
    return (
      <section className="screen">
        <p className="lead">Lernstoff wird geladen …</p>
      </section>
    );
  }

  const aktuell = queue[0] ? karten.get(queue[0]) : undefined;
  const bewertet = verteilung[1] + verteilung[2] + verteilung[3] + verteilung[4];

  if (!aktuell) {
    const zurueck = (
      <p>
        <Link to="/" className="button start-pruefung">Zurück zum Start</Link>
      </p>
    );
    if (bewertet === 0) {
      return (
        <section className="screen">
          <h1>Alles erledigt</h1>
          <p className="lead">Gerade ist nichts zu wiederholen.</p>
          {zurueck}
        </section>
      );
    }
    return (
      <section className="screen">
        <h1>Fertig</h1>
        <p className="lead">{bewertet} {bewertet === 1 ? 'Bewertung' : 'Bewertungen'} in dieser Sitzung.</p>
        <ul className="verteilung">
          {BEWERTUNGEN.map((b) => (
            <li key={b.wert}>
              {b.label}: {verteilung[b.wert]}
            </li>
          ))}
        </ul>
        {zurueck}
      </section>
    );
  }

  const bis = vorschau(kartenZustand.get(aktuell.id), jetzt);
  const intervalle = {} as Record<Bewertung, string>;
  for (const b of BEWERTUNGEN) intervalle[b.wert] = formatIntervall(bis[b.wert].getTime() - jetzt.getTime());

  const bewerten = async (b: Bewertung) => {
    if (beschaeftigt.current) return;
    beschaeftigt.current = true;
    setFehler(false);
    try {
      await record({ art: 'karte', ziel: aktuell.id, bewertung: b });
      setVerteilung((v) => ({ ...v, [b]: v[b] + 1 }));
      setQueue((q) => (q ? (b === 1 ? [...q.slice(1), q[0]!] : q.slice(1)) : q));
      setAufgedeckt(false);
    } catch {
      setFehler(true);
    } finally {
      beschaeftigt.current = false;
    }
  };

  return (
    <section className="screen screen--fach" style={{ '--fach': aktuell.farbe } as CSSProperties}>
      <h1 className="visually-hidden">Wiederholen</h1>
      <p className="lernfortschritt" aria-live="polite">
        Noch {queue.length} von {gesamt}
      </p>
      <div className="fortschritt-balken" aria-hidden="true">
        <span style={{ transform: `scaleX(${gesamt ? (gesamt - queue.length) / gesamt : 0})` }} />
      </div>
      <Lernkarte
        key={aktuell.id}
        frage={aktuell.frage}
        antwort={aktuell.antwort}
        aufgedeckt={aufgedeckt}
        intervalle={intervalle}
        onAufdecken={() => setAufgedeckt(true)}
        onBewerten={(b) => void bewerten(b)}
        aktion={
          kartenAktion ? (
            kartenAktion({ id: aktuell.id, frage: aktuell.frage, antwort: aktuell.antwort })
          ) : (
            <AskBobButton
              key={aktuell.id}
              fach={aktuell.fach}
              thema={aktuell.thema}
              zusammenfassung={aktuell.zusammenfassung}
              element={{ art: 'karte', frage: aktuell.frage, antwort: aktuell.antwort }}
            />
          )
        }
      />
      {fehler && (
        <p className="banner banner--fehler" role="alert">
          Speichern fehlgeschlagen. Ist ein Gerätename eingerichtet?
        </p>
      )}
    </section>
  );
}
