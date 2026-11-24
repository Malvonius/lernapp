import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Exercise, IndexSubject, Probe as ProbeDaten } from '../../format/types';
import { bewerte, formatProzent, formatPunkte, note, probeZiel, type Antwort, type ProbeAuswertung } from '../../lib/probe';
import { useAppData } from '../../state/AppData';
import { Markdown } from '../components/Markdown';
import { Uebung } from '../components/Uebung';

/** Österreichische Notennamen */
const NOTEN_NAME: Record<number, string> = { 1: 'Sehr gut', 2: 'Gut', 3: 'Befriedigend', 4: 'Genügend', 5: 'Nicht genügend' };

const formatRest = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Lösung einer Aufgabe als Markdown (für „Nochmal ansehen“). */
function loesung(a: Exercise): string {
  if (a.typ === 'eingabe') return a.loesung === undefined ? '' : String(a.loesung).replace(/^(-?\d+)\.(\d+)$/, '$1,$2');
  if (a.typ === 'offen') return a.musterloesung ?? '';
  if (a.typ === 'schritte') return (a.schritte ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n');
  const richtig = new Set(a.richtig ?? []);
  return (a.optionen ?? []).filter((_, i) => richtig.has(i)).map((o) => `- ${o}`).join('\n');
}

interface Lauf {
  /** Ende (ms seit Epoch) */
  ende: number;
  dauer: number;
}

function Rahmen({ fach, children }: { fach: IndexSubject | undefined; children: React.ReactNode }) {
  return (
    <section className={fach ? 'screen screen--fach probe' : 'screen probe'} style={fach ? ({ '--fach': fach.farbe } as CSSProperties) : undefined}>
      {children}
    </section>
  );
}

export function Probe() {
  const { fachId, probeId } = useParams();
  const { index, proben, syncStatus } = useAppData();
  const fach = index?.faecher.find((f) => f.id === fachId);
  const eintrag = (fach?.proben ?? []).find((p) => p.id === probeId);
  const probe = eintrag ? proben(eintrag.pfad) : null;

  if (!index) {
    return (
      <Rahmen fach={undefined}>
        <h1>Probe-Schularbeit</h1>
        <p className="lead">{syncStatus.laeuft ? 'Lernstoff wird geladen …' : 'Noch keine Lernstoff-Daten.'}</p>
      </Rahmen>
    );
  }
  if (!fach || !eintrag) {
    return (
      <Rahmen fach={fach}>
        <h1>Probe nicht gefunden</h1>
        <p>
          {fach ? <Link to={`/fach/${encodeURIComponent(fach.id)}`}>Zurück zu {fach.name}</Link> : <Link to="/">Zur Startseite</Link>}
        </p>
      </Rahmen>
    );
  }
  if (eintrag.fehler.length > 0 || (probe && probe.fehler.length > 0)) {
    return (
      <Rahmen fach={fach}>
        <h1>{eintrag.titel}</h1>
        <p className="banner banner--fehler">Datei hat Formatfehler, Bob korrigiert das.</p>
        <p>
          <Link to={`/fach/${encodeURIComponent(fach.id)}`}>Zurück zu {fach.name}</Link>
        </p>
      </Rahmen>
    );
  }
  if (!probe) {
    return (
      <Rahmen fach={fach}>
        <h1>{eintrag.titel}</h1>
        <p className="lead">Probe wird geladen …</p>
      </Rahmen>
    );
  }
  // key: eine andere Probe beginnt immer von vorn
  return <ProbeAblauf key={eintrag.pfad} fach={fach} probe={probe} />;
}

function ProbeAblauf({ fach, probe }: { fach: IndexSubject; probe: ProbeDaten }) {
  const { record } = useAppData();
  const aufgaben = useMemo(() => probe.aufgaben.map((a, nr) => ({ a, nr })).filter(({ a }) => !a.zurueckgezogen), [probe]);
  const max = aufgaben.reduce((s, { a }) => s + (a.punkte ?? 0), 0);

  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [durchgang, setDurchgang] = useState(0);
  const [pos, setPos] = useState(0);
  const [antworten, setAntworten] = useState<Map<number, Antwort>>(new Map());
  const antwortenRef = useRef(antworten);
  const [rest, setRest] = useState(0);
  const [nachfrage, setNachfrage] = useState(false);
  const [auswertung, setAuswertung] = useState<ProbeAuswertung | null>(null);
  const [abgelaufen, setAbgelaufen] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState(false);
  const abgegeben = useRef(false);

  const antworte = (nr: number, a: Antwort) => {
    const neu = new Map(antwortenRef.current).set(nr, a);
    antwortenRef.current = neu;
    setAntworten(neu);
  };

  const gibAb = useCallback(
    (durchZeit: boolean) => {
      if (abgegeben.current) return;
      abgegeben.current = true;
      const a = bewerte(probe.aufgaben, antwortenRef.current);
      setAbgelaufen(durchZeit);
      setNachfrage(false);
      setAuswertung(a);
      void Promise.resolve(record({ art: 'pruefung', ziel: probeZiel(probe.id), punkte: a.punkte, max: a.max })).catch(() => setSpeicherFehler(true));
    },
    [probe, record],
  );

  // Timer: Restzeit mitführen, bei Ablauf automatisch abgeben.
  useEffect(() => {
    if (!lauf || auswertung) return;
    const tick = () => {
      const r = lauf.ende - Date.now();
      setRest(Math.max(0, r));
      if (r <= 0) gibAb(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lauf, auswertung, gibAb]);

  // Neue Aufgabe: nach oben, damit die Frage sichtbar ist
  useEffect(() => {
    if (lauf) window.scrollTo?.({ top: 0 });
  }, [pos, lauf]);

  const starte = () => {
    const dauer = probe.dauerMin * 60_000;
    abgegeben.current = false;
    antwortenRef.current = new Map();
    setAntworten(new Map());
    setPos(0);
    setAuswertung(null);
    setAbgelaufen(false);
    setSpeicherFehler(false);
    setRest(dauer);
    setDurchgang((d) => d + 1);
    setLauf({ ende: Date.now() + dauer, dauer });
  };

  const zurueck = (
    <Link to={`/fach/${encodeURIComponent(fach.id)}`} className="button button--quiet probe__zurueck">
      Zurück zu {fach.name}
    </Link>
  );

  // --- Startseite ---
  if (!lauf) {
    return (
      <Rahmen fach={fach}>
        <p className="probe__fach">{fach.name}</p>
        <h1 className="fach-titel">{probe.titel}</h1>
        <dl className="probe-blatt">
          <div>
            <dt>Dauer</dt>
            <dd>{probe.dauerMin} Minuten</dd>
          </div>
          <div>
            <dt>Punkte</dt>
            <dd>{formatPunkte(max)} Punkte</dd>
          </div>
          <div>
            <dt>Aufgaben</dt>
            <dd>{aufgaben.length}</dd>
          </div>
        </dl>
        {probe.hinweise && (
          <section className="probe-hinweise" aria-labelledby="probe-hinweise-h">
            <h2 id="probe-hinweise-h">Hinweise</h2>
            <Markdown text={probe.hinweise} />
          </section>
        )}
        <p className="probe__erklaerung">
          Der Timer läuft ab dem Start; ist die Zeit um, wird automatisch abgegeben. Eingaben und Auswahlaufgaben prüft die App,
          bei offenen Aufgaben schätzt du deine Punkte nach der Lösung selbst ein.
          {probe.notenschluessel ? ' Am Ende siehst du die Note nach dem hinterlegten Notenschlüssel.' : ' Für diese Probe ist kein Notenschlüssel hinterlegt: du bekommst Punkte und Prozent, aber keine Note.'}
        </p>
        <div className="probe__aktionen">
          <button type="button" className="button probe__start" onClick={starte} disabled={aufgaben.length === 0}>
            Starten
          </button>
          {zurueck}
        </div>
      </Rahmen>
    );
  }

  // --- Ergebnis ---
  if (auswertung) {
    const n = note(auswertung.prozent, probe.notenschluessel);
    const nachsehen = auswertung.aufgaben.filter((e) => e.punkte < e.max);
    return (
      <Rahmen fach={fach}>
        <p className="probe__fach">{probe.titel}</p>
        <h1>Ergebnis</h1>
        {abgelaufen && <p className="banner">Die Zeit ist abgelaufen. Die Probe wurde automatisch abgegeben, offene Aufgaben zählen 0 Punkte.</p>}
        <div className="probe-ergebnis">
          <p className="probe-ergebnis__punkte">{`${formatPunkte(auswertung.punkte)} von ${formatPunkte(auswertung.max)}`}</p>
          <p className="probe-ergebnis__einheit">Punkten</p>
          <p className="probe-ergebnis__prozent">{formatProzent(auswertung.prozent)}</p>
          {n !== null ? (
            <p className="probe-ergebnis__note">
              Note {n} <span>{NOTEN_NAME[n]}</span>
            </p>
          ) : (
            <p className="probe-ergebnis__ohne">Kein Notenschlüssel hinterlegt</p>
          )}
          <div className="probe-ergebnis__balken" role="presentation">
            <span style={{ width: `${Math.min(100, auswertung.prozent)}%` }} />
          </div>
        </div>

        <h2 className="abschnitt-titel">Aufgaben</h2>
        <ol className="probe-punkte">
          {auswertung.aufgaben.map((e, i) => (
            <li key={e.nr} data-stufe={e.stufe}>
              <span>Aufgabe {i + 1}</span>
              <span className="probe-punkte__wert">
                {formatPunkte(e.punkte)} von {formatPunkte(e.max)}
              </span>
            </li>
          ))}
        </ol>

        {nachsehen.length > 0 && (
          <>
            <h2 className="abschnitt-titel" id="probe-nachsehen">Nochmal ansehen</h2>
            <ul className="pruefung__falsch" aria-labelledby="probe-nachsehen">
              {nachsehen.map((e) => {
                const a = probe.aufgaben[e.nr]!;
                const l = loesung(a);
                return (
                  <li key={e.nr}>
                    <p className="probe-nachsehen__kopf">
                      Aufgabe {aufgaben.findIndex((x) => x.nr === e.nr) + 1} · {formatPunkte(e.punkte)} von {formatPunkte(e.max)} Punkten
                      {e.stufe === 'offen' ? ' (nicht beantwortet)' : ''}
                    </p>
                    <Markdown text={a.frage} />
                    {l && (
                      <details className="probe-nachsehen__loesung">
                        <summary>Lösung ansehen</summary>
                        <Markdown text={l} />
                      </details>
                    )}
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
        <div className="probe__aktionen">
          <button type="button" className="button" onClick={starte}>
            Nochmal schreiben
          </button>
          {zurueck}
        </div>
      </Rahmen>
    );
  }

  // --- Aufgaben ---
  const offen = aufgaben.filter(({ nr }) => !antworten.has(nr)).length;
  const aktuell = aufgaben[pos]!;
  const anteil = lauf.dauer > 0 ? rest / lauf.dauer : 0;
  const knapp = rest <= 5 * 60_000;
  const abgeben = () => (offen > 0 ? setNachfrage(true) : gibAb(false));

  return (
    <Rahmen fach={fach}>
      <h1 className="visually-hidden">{probe.titel}</h1>
      <div className="probe-kopf" data-knapp={knapp}>
        <div className="probe-kopf__zeile">
          <p className="probe-kopf__zeit">
            <span className="visually-hidden">Restzeit </span>
            <span role="timer" aria-live="off">
              {formatRest(rest)}
            </span>
          </p>
          <button type="button" className="button probe-kopf__abgeben" onClick={abgeben}>
            Abgeben
          </button>
        </div>
        {/* Glut brennt herunter: Restzeit als Linie */}
        <div className="probe-kopf__lunte" role="presentation">
          <span style={{ transform: `scaleX(${anteil})` }} />
        </div>
      </div>

      {nachfrage && (
        <div className="probe-nachfrage" role="alertdialog" aria-labelledby="probe-nachfrage-t">
          <p id="probe-nachfrage-t">
            Noch {offen} {offen === 1 ? 'Aufgabe' : 'Aufgaben'} offen. Offene Aufgaben zählen 0 Punkte.
          </p>
          <div className="uebung__zeile">
            <button type="button" className="button" onClick={() => gibAb(false)}>
              Trotzdem abgeben
            </button>
            <button type="button" className="button button--quiet" onClick={() => setNachfrage(false)}>
              Weiterarbeiten
            </button>
          </div>
        </div>
      )}

      <nav className="probe-leiste" aria-label="Aufgaben">
        <ol>
          {aufgaben.map(({ nr }, i) => (
            <li key={nr}>
              <button
                type="button"
                className="probe-leiste__knopf"
                aria-current={i === pos ? 'step' : undefined}
                data-beantwortet={antworten.has(nr)}
                aria-label={`Aufgabe ${i + 1}, ${antworten.has(nr) ? 'beantwortet' : 'offen'}`}
                onClick={() => setPos(i)}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <p className="lernfortschritt" aria-live="polite">
        Aufgabe {pos + 1} von {aufgaben.length} · {formatPunkte(aktuell.a.punkte ?? 0)} {aktuell.a.punkte === 1 ? 'Punkt' : 'Punkte'}
      </p>

      {/* Alle Aufgaben bleiben gemountet (nur verborgen), damit vor/zurück den Stand behält */}
      {aufgaben.map(({ a, nr }, i) => (
        <div key={`${durchgang}-${nr}`} hidden={i !== pos} className="probe-aufgabe">
          <Uebung
            ex={a}
            aufzeichnen
            onErgebnis={a.typ === 'eingabe' || a.typ === 'mc' ? (richtig) => antworte(nr, { art: 'auto', richtig }) : undefined}
            onStufe={a.typ === 'schritte' || a.typ === 'offen' ? (stufe) => antworte(nr, { art: 'selbst', stufe }) : undefined}
          />
        </div>
      ))}

      <div className="probe-nav">
        <button type="button" className="button button--quiet" disabled={pos === 0} onClick={() => setPos(pos - 1)}>
          Vorherige Aufgabe
        </button>
        {pos + 1 < aufgaben.length ? (
          <button type="button" className="button" onClick={() => setPos(pos + 1)}>
            Nächste Aufgabe
          </button>
        ) : (
          <p className="probe-nav__ende">Letzte Aufgabe · oben abgeben</p>
        )}
      </div>
    </Rahmen>
  );
}
