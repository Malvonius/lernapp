import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Card, Exercise, IndexSubject, Topic } from '../../format/types';
import { bauePruefung, werteAus, type Aufgabe, type Auswertung, type PruefungsThema } from '../../lib/exam';
import { useAppData } from '../../state/AppData';
import { AskBobButton } from '../components/AskBobButton';
import { Markdown } from '../components/Markdown';
import { Uebung } from '../components/Uebung';

const ANZAHLEN = [10, 20, 30];
const LIMITS = [15, 30, 45];

interface Quelle {
  karte?: Card;
  uebung?: Exercise;
  thema: string;
  topic: Topic;
}

interface Lauf {
  aufgaben: Aufgabe[];
  quellen: Map<string, Quelle>;
  fachId: string;
  ziel: string;
  /** Ende des Zeitlimits (ms), null ohne Limit */
  ende: number | null;
}

/** Themen eines Fachs mit Unterlagen, je Kapitel (Kapitel ohne Themen oder ohne Pfad entfallen). */
function kapitelThemen(fach: IndexSubject, topics: (pfad: string) => Topic | null) {
  return fach.kapitel.map((k) => ({
    ordner: k.ordner,
    titel: k.titel,
    themen: k.themen.flatMap((t) => {
      const topic = t.pfad ? topics(t.pfad) : null;
      return topic ? [topic] : [];
    }),
  }));
}

const aktiv = (t: Topic) => t.karten.filter((k) => k.id && !k.zurueckgezogen).length + t.uebungen.filter((u) => u.id && !u.zurueckgezogen).length;

const formatRest = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Pruefung() {
  const { index, topics, record, zufall } = useAppData();
  const [fachId, setFachId] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [anzahl, setAnzahl] = useState(10);
  const [limit, setLimit] = useState<number | null>(null);

  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [pos, setPos] = useState(0);
  const [aufgedeckt, setAufgedeckt] = useState(false);
  const [uebungFertig, setUebungFertig] = useState(false);
  const [auswertung, setAuswertung] = useState<Auswertung | null>(null);
  const [rest, setRest] = useState<number | null>(null);
  const [speicherFehler, setSpeicherFehler] = useState(false);

  const ergebnisse = useRef(new Map<string, boolean>());
  const beendet = useRef(false);

  const fach = index?.faecher.find((f) => f.id === fachId) ?? null;
  const kapitel = useMemo(() => (fach ? kapitelThemen(fach, topics).filter((k) => k.themen.some((t) => aktiv(t) > 0)) : []), [fach, topics]);

  const beende = useCallback(
    (l: Lauf) => {
      if (beendet.current) return;
      beendet.current = true;
      const a = werteAus(l.aufgaben, ergebnisse.current);
      setAuswertung(a);
      void Promise.resolve(record({ art: 'pruefung', ziel: l.ziel, punkte: a.punkte, max: a.max })).catch(() => setSpeicherFehler(true));
    },
    [record],
  );

  // Zeitlimit: Restzeit mitführen, bei Ablauf zählen offene Aufgaben als falsch.
  useEffect(() => {
    if (!lauf || lauf.ende === null || auswertung) return;
    const ende = lauf.ende;
    const tick = () => {
      const r = ende - Date.now();
      setRest(Math.max(0, r));
      if (r <= 0) beende(lauf);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lauf, auswertung, beende]);

  if (!index) {
    return (
      <section className="screen">
        <h1>Prüfung</h1>
        <p className="lead">Lernstoff wird geladen …</p>
      </section>
    );
  }

  const starte = () => {
    if (!fach) return;
    const ordner = kapitel.filter((k) => gewaehlt.includes(k.ordner));
    const eingabe: PruefungsThema[] = ordner.flatMap((k) => k.themen.map((topic) => ({ fach: fach.id, kapitel: k.ordner, topic })));
    const aufgaben = bauePruefung(eingabe, anzahl, zufall);
    const quellen = new Map<string, Quelle>();
    for (const { topic } of eingabe) {
      for (const k of topic.karten) if (k.id) quellen.set(k.id, { karte: k, thema: topic.id, topic });
      for (const u of topic.uebungen) if (u.id) quellen.set(u.id, { uebung: u, thema: topic.id, topic });
    }
    ergebnisse.current = new Map();
    beendet.current = false;
    setPos(0);
    setAufgedeckt(false);
    setUebungFertig(false);
    setAuswertung(null);
    setSpeicherFehler(false);
    setRest(limit ? limit * 60_000 : null);
    setLauf({
      aufgaben,
      quellen,
      fachId: fach.id,
      ziel: `${fach.id}:${ordner.map((k) => k.ordner).sort().join(',')}`,
      ende: limit ? Date.now() + limit * 60_000 : null,
    });
  };

  const weiter = (l: Lauf) => {
    if (pos + 1 >= l.aufgaben.length) {
      beende(l);
      return;
    }
    setPos(pos + 1);
    setAufgedeckt(false);
    setUebungFertig(false);
  };

  const kartenUrteil = (l: Lauf, a: Aufgabe, gewusst: boolean) => {
    ergebnisse.current.set(a.id, gewusst);
    if (!gewusst) {
      // Falsch beantwortete Karten kommen in der Wiederholung früher wieder.
      void Promise.resolve(record({ art: 'karte', ziel: a.id, bewertung: 1 })).catch(() => setSpeicherFehler(true));
    }
    weiter(l);
  };

  // --- Einrichtung ---
  if (!lauf) {
    const kannStarten = fach !== null && gewaehlt.length > 0;
    return (
      <section className="screen" style={fach ? ({ '--fach': fach.farbe } as CSSProperties) : undefined}>
        <h1>Prüfung</h1>
        <p className="lead">Eine Probeprüfung aus Karten und Übungen deiner Kapitel.</p>

        <fieldset className="pruefung__gruppe">
          <legend>Fach</legend>
          <div className="pruefung__auswahl">
            {index.faecher.map((f) => (
              <label key={f.id} className="pruefung__option">
                <input
                  type="radio"
                  name="fach"
                  checked={fachId === f.id}
                  onChange={() => {
                    setFachId(f.id);
                    setGewaehlt([]);
                  }}
                />
                {f.name}
              </label>
            ))}
          </div>
        </fieldset>

        {fach && (
          <fieldset className="pruefung__gruppe">
            <legend>Kapitel</legend>
            {kapitel.length === 0 ? (
              <p className="lead">In diesem Fach gibt es noch keine Karten oder Übungen.</p>
            ) : (
              <div className="pruefung__auswahl">
                {kapitel.map((k) => (
                  <label key={k.ordner} className="pruefung__option">
                    <input
                      type="checkbox"
                      checked={gewaehlt.includes(k.ordner)}
                      onChange={() => setGewaehlt((g) => (g.includes(k.ordner) ? g.filter((x) => x !== k.ordner) : [...g, k.ordner]))}
                    />
                    {k.titel}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <div className="field">
          <label htmlFor="pruefung-anzahl">Anzahl Aufgaben</label>
          <select id="pruefung-anzahl" value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))}>
            {ANZAHLEN.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pruefung-limit">Zeitlimit</label>
          <select id="pruefung-limit" value={limit ?? ''} onChange={(e) => setLimit(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Ohne Zeitlimit</option>
            {LIMITS.map((m) => (
              <option key={m} value={m}>
                {m} Minuten
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="button" disabled={!kannStarten} onClick={starte}>
          Prüfung starten
        </button>
      </section>
    );
  }

  // --- Auswertung ---
  if (auswertung) {
    const prozent = (p: number, m: number) => (m === 0 ? 0 : Math.round((p / m) * 100));
    const titelVon = (ordner: string) => kapitel.find((k) => k.ordner === ordner)?.titel ?? ordner;
    const falsch = lauf.aufgaben.filter((a) => ergebnisse.current.get(a.id) !== true);
    const abgelaufen = lauf.ende !== null && rest === 0 && ergebnisse.current.size < lauf.aufgaben.length;
    return (
      <section className="screen" style={fach ? ({ '--fach': fach.farbe } as CSSProperties) : undefined}>
        <h1>Auswertung</h1>
        {abgelaufen && <p className="banner">Die Zeit ist abgelaufen. Offene Aufgaben zählen als falsch.</p>}
        <p className="pruefung__summe">
          {auswertung.punkte} von {auswertung.max}
        </p>
        <ul className="pruefung__kapitel">
          {auswertung.kapitel.map((k) => (
            <li key={k.kapitel}>
              <div className="pruefung__kapitelkopf">
                <span>{titelVon(k.kapitel)}</span>
                <span>
                  {k.punkte} von {k.max} ({prozent(k.punkte, k.max)} %)
                </span>
              </div>
              <div className="pruefung__balken" role="presentation">
                <div className="pruefung__fuellung" style={{ width: `${prozent(k.punkte, k.max)}%` }} />
              </div>
            </li>
          ))}
        </ul>

        {falsch.length > 0 && (
          <>
            <h2>Nochmal ansehen</h2>
            <ul className="pruefung__falsch">
              {falsch.map((a) => {
                const q = lauf.quellen.get(a.id);
                const text = q?.karte?.frage ?? q?.uebung?.frage ?? a.id;
                return (
                  <li key={a.id}>
                    <Markdown text={text} />
                    <Link to={`/thema/${encodeURIComponent(lauf.fachId)}/${encodeURIComponent(a.themaId)}`}>Zum Thema</Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {speicherFehler && (
          <p className="banner banner--fehler" role="alert">
            Ergebnis konnte nicht gespeichert werden. Ist ein Gerätename eingerichtet?
          </p>
        )}
        <p>
          <Link to="/" className="button start-pruefung">Zurück zum Start</Link>
        </p>
      </section>
    );
  }

  // --- Aufgaben ---
  const a = lauf.aufgaben[pos];
  const q = a ? lauf.quellen.get(a.id) : undefined;
  if (!a || !q) {
    return (
      <section className="screen">
        <h1>Prüfung</h1>
        <p className="lead">Keine Aufgaben gefunden.</p>
        <button type="button" className="button" onClick={() => setLauf(null)}>
          Zurück
        </button>
      </section>
    );
  }
  const letzte = pos + 1 >= lauf.aufgaben.length;

  return (
    <section className="screen" style={fach ? ({ '--fach': fach.farbe } as CSSProperties) : undefined}>
      <h1 className="visually-hidden">Prüfung</h1>
      <p className="lernfortschritt" aria-live="polite">
        Aufgabe {pos + 1} von {lauf.aufgaben.length}
        {rest !== null && <span className="pruefung__zeit"> · Noch {formatRest(rest)}</span>}
      </p>
      {q.karte ? (
        <article className="lernkarte">
          <div className="lernkarte__frage">
            <Markdown text={q.karte.frage} />
          </div>
          {aufgedeckt ? (
            <>
              <div className="lernkarte__antwort">
                <Markdown text={q.karte.antwort} />
              </div>
              <div className="uebung__zeile">
                <button type="button" className="button" onClick={() => kartenUrteil(lauf, a, true)}>
                  Gewusst
                </button>
                <button type="button" className="button button--quiet" onClick={() => kartenUrteil(lauf, a, false)}>
                  Nicht gewusst
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="button" onClick={() => setAufgedeckt(true)}>
              Antwort zeigen
            </button>
          )}
        </article>
      ) : (
        q.uebung && (
          <>
            <Uebung
              ex={q.uebung}
              aufzeichnen
              // Hilfe erst nach der Antwort, nicht während der Prüfung
              aktion={({ beantwortet, element }) =>
                beantwortet && fach ? (
                  <AskBobButton fach={fach.name} thema={q.topic.titel} zusammenfassung={q.topic.zusammenfassung} element={element} />
                ) : null
              }
              onErgebnis={(richtig) => {
                ergebnisse.current.set(a.id, richtig);
                setUebungFertig(true);
              }}
            />
            {uebungFertig && (
              <button type="button" className="button" onClick={() => weiter(lauf)}>
                {letzte ? 'Zur Auswertung' : 'Weiter'}
              </button>
            )}
          </>
        )
      )}
      {speicherFehler && (
        <p className="banner banner--fehler" role="alert">
          Speichern fehlgeschlagen. Ist ein Gerätename eingerichtet?
        </p>
      )}
    </section>
  );
}
