import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Exercise, IndexSubject, Probe as ProbeDaten } from '../../format/types';
import { pruefeEingabe, pruefeMc } from '../../lib/check';
import { bewerte, formatProzent, formatPunkte, note, probeZiel, teilPunkte, type Antwort, type Stufe } from '../../lib/probe';
import { useAppData, type NeuesEreignis } from '../../state/AppData';
import { Markdown } from '../components/Markdown';

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

/** Was während der Probe eingegeben wurde: Text (eingabe, schritte, offen) bzw. gewählte Optionen (mc). */
interface Eingabe {
  text: string;
  gewaehlt: number[];
}
const LEER: Eingabe = { text: '', gewaehlt: [] };

const istSelbst = (a: Exercise) => a.typ === 'schritte' || a.typ === 'offen';
const beantwortet = (a: Exercise, e: Eingabe | undefined) => (e ? (a.typ === 'mc' ? e.gewaehlt.length > 0 : e.text.trim() !== '') : false);

const STUFEN: { s: Stufe; text: string }[] = [
  { s: 'voll', text: 'Voll' },
  { s: 'teilweise', text: 'Teilweise' },
  { s: 'keine', text: 'Keine' },
];

/** Eine Aufgabe während der Probe: nur Eingabe, kein Prüfen, keine Lösung. */
function AufgabeFeld({ a, wert, onChange }: { a: Exercise; wert: Eingabe; onChange: (e: Eingabe) => void }) {
  return (
    <article className="uebung probe-feld">
      <div className="uebung__frage">
        <Markdown text={a.frage} />
      </div>
      {a.typ === 'eingabe' && (
        <input
          type="text"
          className="uebung__eingabe"
          aria-label="Deine Antwort"
          autoComplete="off"
          value={wert.text}
          onChange={(e) => onChange({ ...wert, text: e.target.value })}
        />
      )}
      {a.typ === 'mc' && (
        <ul className="uebung__optionen">
          {(a.optionen ?? []).map((o, i) => (
            <li key={i} className="uebung__option">
              <label>
                <input
                  type="checkbox"
                  checked={wert.gewaehlt.includes(i)}
                  onChange={() =>
                    onChange({ ...wert, gewaehlt: wert.gewaehlt.includes(i) ? wert.gewaehlt.filter((x) => x !== i) : [...wert.gewaehlt, i] })
                  }
                />
                <Markdown text={o} />
              </label>
            </li>
          ))}
        </ul>
      )}
      {istSelbst(a) && (
        <>
          <textarea className="uebung__eingabe" aria-label="Deine Lösung" rows={6} value={wert.text} onChange={(e) => onChange({ ...wert, text: e.target.value })} />
          <p className="probe-feld__hinweis">Die Musterlösung siehst du nach der Abgabe; dort schätzt du deine Punkte selbst ein.</p>
        </>
      )}
    </article>
  );
}

interface Abgabe {
  /** eingabe/mc: automatisch geprüft */
  auto: Map<number, boolean>;
  eingaben: Map<number, Eingabe>;
  durchZeit: boolean;
}

function ProbeAblauf({ fach, probe }: { fach: IndexSubject; probe: ProbeDaten }) {
  const { record } = useAppData();
  const aufgaben = useMemo(() => probe.aufgaben.map((a, nr) => ({ a, nr })).filter(({ a }) => !a.zurueckgezogen), [probe]);
  const max = aufgaben.reduce((s, { a }) => s + (a.punkte ?? 0), 0);

  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [pos, setPos] = useState(0);
  const [eingaben, setEingaben] = useState<Map<number, Eingabe>>(new Map());
  const eingabenRef = useRef(eingaben);
  const [rest, setRest] = useState(0);
  const [nachfrage, setNachfrage] = useState(false);
  const [abgabe, setAbgabe] = useState<Abgabe | null>(null);
  const [stufen, setStufen] = useState<Map<number, Stufe>>(new Map());
  const [gespeichert, setGespeichert] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState(false);

  // Refs: Speichern beim Verlassen (Unmount) liest den aktuellen Stand; nach dem Unmount kein setState.
  const abgabeRef = useRef<Abgabe | null>(null);
  const stufenRef = useRef(stufen);
  const gespeichertRef = useRef(false);
  const aktiv = useRef(true);

  const setzeEingabe = (nr: number, e: Eingabe) => {
    const neu = new Map(eingabenRef.current).set(nr, e);
    eingabenRef.current = neu;
    setEingaben(neu);
  };

  /** Alle Antworten als Bewertungs-Eingabe (auto + bisher eingeschätzte) */
  const antwortenAus = useCallback((ab: Abgabe, st: Map<number, Stufe>) => {
    const m = new Map<number, Antwort>();
    for (const [nr, richtig] of ab.auto) m.set(nr, { art: 'auto', richtig });
    for (const [nr, s] of st) m.set(nr, { art: 'selbst', stufe: s });
    return m;
  }, []);

  /** Schreibt erst jetzt die Ereignisse: je bewerteter Aufgabe `uebung`, dann `pruefung`. Genau einmal. */
  const speichere = useCallback(
    (ab: Abgabe, st: Map<number, Stufe>) => {
      if (gespeichertRef.current) return;
      gespeichertRef.current = true;
      if (aktiv.current) setGespeichert(true);
      const a = bewerte(probe.aufgaben, antwortenAus(ab, st));
      const ereignisse: NeuesEreignis[] = [];
      for (const { a: aufgabe, nr } of aufgaben) {
        if (!aufgabe.id) continue;
        const richtig = ab.auto.has(nr) ? ab.auto.get(nr)! : st.has(nr) ? st.get(nr) === 'voll' : null;
        if (richtig !== null) ereignisse.push({ art: 'uebung', ziel: aufgabe.id, richtig });
      }
      ereignisse.push({ art: 'pruefung', ziel: probeZiel(probe.id), punkte: a.punkte, max: a.max });
      void ereignisse
        .reduce<Promise<unknown>>((kette, e) => kette.then(() => record(e)), Promise.resolve())
        .catch(() => {
          if (aktiv.current) setSpeicherFehler(true);
        });
    },
    [aufgaben, antwortenAus, probe, record],
  );

  // Immer die aktuelle speichere-Funktion, ohne dass die Effekte unten neu laufen (neues Probe-Objekt nach einem Abgleich)
  const speichereRef = useRef(speichere);
  speichereRef.current = speichere;

  /** Ergebnisseite verlassen, ohne zu speichern: mit dem aktuellen Stand speichern (nicht Eingeschätztes zählt 0). */
  const sichereOffenesErgebnis = useCallback(() => {
    if (abgabeRef.current && !gespeichertRef.current) speichereRef.current(abgabeRef.current, stufenRef.current);
  }, []);

  // Nur beim echten Unmount
  useEffect(() => {
    aktiv.current = true;
    return () => {
      aktiv.current = false;
      sichereOffenesErgebnis();
    };
  }, [sichereOffenesErgebnis]);

  // App/Tab geschlossen oder in den Hintergrund: Unmount findet dann oft nie statt, also jetzt speichern
  useEffect(() => {
    const beiSichtbarkeit = () => {
      if (document.visibilityState === 'hidden') sichereOffenesErgebnis();
    };
    document.addEventListener('visibilitychange', beiSichtbarkeit);
    window.addEventListener('pagehide', sichereOffenesErgebnis);
    return () => {
      document.removeEventListener('visibilitychange', beiSichtbarkeit);
      window.removeEventListener('pagehide', sichereOffenesErgebnis);
    };
  }, [sichereOffenesErgebnis]);

  const gibAb = useCallback(
    (durchZeit: boolean) => {
      if (abgabeRef.current) return;
      const auto = new Map<number, boolean>();
      for (const { a, nr } of aufgaben) {
        const e = eingabenRef.current.get(nr);
        if (a.typ === 'eingabe') auto.set(nr, beantwortet(a, e) && pruefeEingabe(a, e!.text));
        else if (a.typ === 'mc') auto.set(nr, beantwortet(a, e) && pruefeMc(a, e!.gewaehlt));
      }
      const ab: Abgabe = { auto, eingaben: eingabenRef.current, durchZeit };
      abgabeRef.current = ab;
      setNachfrage(false);
      setAbgabe(ab);
      // Nichts selbst einzuschätzen: gleich speichern
      if (!aufgaben.some(({ a, nr }) => istSelbst(a) && beantwortet(a, ab.eingaben.get(nr)))) speichere(ab, new Map());
    },
    [aufgaben, speichere],
  );

  // Timer: Restzeit mitführen, bei Ablauf automatisch abgeben.
  useEffect(() => {
    if (!lauf || abgabe) return;
    const tick = () => {
      const r = lauf.ende - Date.now();
      setRest(Math.max(0, r));
      if (r <= 0) gibAb(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lauf, abgabe, gibAb]);

  // Neue Aufgabe: nach oben, damit die Frage sichtbar ist
  useEffect(() => {
    if (lauf) window.scrollTo?.({ top: 0 });
  }, [pos, lauf, abgabe]);

  const starte = () => {
    if (abgabeRef.current && !gespeichertRef.current) speichere(abgabeRef.current, stufenRef.current);
    const dauer = probe.dauerMin * 60_000;
    abgabeRef.current = null;
    gespeichertRef.current = false;
    eingabenRef.current = new Map();
    stufenRef.current = new Map();
    setEingaben(new Map());
    setStufen(new Map());
    setPos(0);
    setAbgabe(null);
    setGespeichert(false);
    setSpeicherFehler(false);
    setRest(dauer);
    setLauf({ ende: Date.now() + dauer, dauer });
  };

  const waehle = (nr: number, s: Stufe) => {
    if (gespeichertRef.current) return;
    const neu = new Map(stufenRef.current).set(nr, s);
    stufenRef.current = neu;
    setStufen(neu);
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
        <dl className="probe-blatt" aria-label={`${probe.dauerMin} Minuten, ${formatPunkte(max)} Punkte, ${aufgaben.length} Aufgaben`}>
          <div>
            <dt>Dauer</dt>
            <dd>{probe.dauerMin} Min</dd>
          </div>
          <div>
            <dt>Punkte</dt>
            <dd>{formatPunkte(max)}</dd>
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
          Wie bei der echten Schularbeit: Während des Schreibens gibt es keine Rückmeldung, Antworten kannst du bis zur Abgabe
          ändern. Ist die Zeit um, wird automatisch abgegeben. Danach prüft die App Eingaben und Auswahlaufgaben, offene Aufgaben
          schätzt du mit der Musterlösung selbst ein.
          {probe.notenschluessel ? ' Die Note kommt aus dem hinterlegten Notenschlüssel.' : ' Für diese Probe ist kein Notenschlüssel hinterlegt: du bekommst Punkte und Prozent, aber keine Note.'}
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
  if (abgabe) {
    const auswertung = bewerte(probe.aufgaben, antwortenAus(abgabe, stufen));
    const n = note(auswertung.prozent, probe.notenschluessel);
    const nrAnzeige = (nr: number) => aufgaben.findIndex((x) => x.nr === nr) + 1;
    const selbst = aufgaben.filter(({ a, nr }) => istSelbst(a) && beantwortet(a, abgabe.eingaben.get(nr)));
    const offenEinzuschaetzen = selbst.filter(({ nr }) => !stufen.has(nr)).length;
    const nachsehen = auswertung.aufgaben.filter((e) => e.punkte < e.max && !(selbst.some((s) => s.nr === e.nr) && !stufen.has(e.nr)));
    return (
      <Rahmen fach={fach}>
        <p className="probe__fach">{probe.titel}</p>
        <h1>Ergebnis</h1>
        {abgabe.durchZeit && <p className="banner">Die Zeit ist abgelaufen. Die Probe wurde automatisch abgegeben, offene Aufgaben zählen 0 Punkte.</p>}
        <div className="probe-ergebnis" aria-live="polite">
          <p className="probe-ergebnis__punkte">{`${formatPunkte(auswertung.punkte)} von ${formatPunkte(auswertung.max)}`}</p>
          <p className="probe-ergebnis__einheit">Punkten{offenEinzuschaetzen > 0 ? ' (ohne Selbsteinschätzung)' : ''}</p>
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

        {selbst.length > 0 && (
          <section className="probe-einschaetzen" aria-labelledby="probe-einschaetzen-h">
            <h2 className="abschnitt-titel" id="probe-einschaetzen-h">Selbst einschätzen</h2>
            <p className="statistik__unter probe-einschaetzen__erklaerung">
              Vergleiche deine Lösung mit der Musterlösung und wähle, wie viele Punkte du bekommen hättest.
            </p>
            <ol className="probe-einschaetzen__liste">
              {selbst.map(({ a, nr }) => {
                const gewaehlt = stufen.get(nr);
                const wert: Record<Stufe, number> = { voll: a.punkte ?? 0, teilweise: teilPunkte(a.punkte ?? 0), keine: 0 };
                return (
                  <li key={nr} className="probe-einschaetzen__aufgabe" data-gewaehlt={gewaehlt ?? ''}>
                    <p className="probe-nachsehen__kopf">
                      Aufgabe {nrAnzeige(nr)} · {formatPunkte(a.punkte ?? 0)} Punkte
                    </p>
                    <Markdown text={a.frage} />
                    <div className="probe-einschaetzen__vergleich">
                      <div>
                        <h3>Deine Lösung</h3>
                        <p className="probe-einschaetzen__eigene">{abgabe.eingaben.get(nr)?.text}</p>
                      </div>
                      <div>
                        <h3>Musterlösung</h3>
                        <Markdown text={loesung(a) || 'Keine Musterlösung hinterlegt.'} />
                      </div>
                    </div>
                    <div className="stufenwahl__knoepfe" role="group" aria-label={`Punkte für Aufgabe ${nrAnzeige(nr)}`}>
                      {STUFEN.map(({ s, text }) => (
                        <button
                          key={s}
                          type="button"
                          className={`stufenwahl__knopf stufenwahl__knopf--${s}`}
                          aria-pressed={gewaehlt === s}
                          disabled={gespeichert}
                          onClick={() => waehle(nr, s)}
                        >
                          {text}
                          <small>{formatPunkte(wert[s])} P.</small>
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
            {gespeichert ? (
              <p className="probe-einschaetzen__status" role="status">
                Ergebnis gespeichert
              </p>
            ) : (
              <div className="probe-einschaetzen__speichern">
                <button type="button" className="button" onClick={() => speichere(abgabe, stufenRef.current)}>
                  Ergebnis speichern
                </button>
                {offenEinzuschaetzen > 0 && (
                  <p className="probe-feld__hinweis">
                    Noch {offenEinzuschaetzen} {offenEinzuschaetzen === 1 ? 'Aufgabe' : 'Aufgaben'} ohne Einschätzung; sie zählen 0 Punkte.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <h2 className="abschnitt-titel">Aufgaben</h2>
        <ol className="probe-punkte">
          {auswertung.aufgaben.map((e) => (
            <li key={e.nr} data-stufe={selbst.some((s) => s.nr === e.nr) && !stufen.has(e.nr) ? 'einschaetzen' : e.stufe}>
              <span>Aufgabe {nrAnzeige(e.nr)}</span>
              <span className="probe-punkte__wert">
                {selbst.some((s) => s.nr === e.nr) && !stufen.has(e.nr) ? 'noch einschätzen' : `${formatPunkte(e.punkte)} von ${formatPunkte(e.max)}`}
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
                const eigene = abgabe.eingaben.get(e.nr);
                const eigeneText =
                  a.typ === 'mc' ? (eigene?.gewaehlt ?? []).map((i) => a.optionen?.[i] ?? '').join('; ') : (eigene?.text.trim() ?? '');
                return (
                  <li key={e.nr}>
                    <p className="probe-nachsehen__kopf">
                      Aufgabe {nrAnzeige(e.nr)} · {formatPunkte(e.punkte)} von {formatPunkte(e.max)} Punkten
                      {beantwortet(a, eigene) ? '' : ' (nicht beantwortet)'}
                    </p>
                    <Markdown text={a.frage} />
                    {a.typ !== 'mc' && eigeneText && <p className="probe-nachsehen__eigene">Deine Antwort: {eigeneText}</p>}
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
          <button type="button" className="button button--quiet" onClick={starte}>
            Nochmal schreiben
          </button>
          {zurueck}
        </div>
      </Rahmen>
    );
  }

  // --- Aufgaben ---
  const offen = aufgaben.filter(({ a, nr }) => !beantwortet(a, eingaben.get(nr))).length;
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
          {aufgaben.map(({ a, nr }, i) => {
            const fertig = beantwortet(a, eingaben.get(nr));
            return (
              <li key={nr}>
                <button
                  type="button"
                  className="probe-leiste__knopf"
                  aria-current={i === pos ? 'step' : undefined}
                  data-beantwortet={fertig}
                  aria-label={`Aufgabe ${i + 1}, ${fertig ? 'beantwortet' : 'offen'}`}
                  onClick={() => setPos(i)}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <p className="lernfortschritt" aria-live="polite">
        Aufgabe {pos + 1} von {aufgaben.length} · {formatPunkte(aktuell.a.punkte ?? 0)} {aktuell.a.punkte === 1 ? 'Punkt' : 'Punkte'}
      </p>

      <AufgabeFeld key={aktuell.nr} a={aktuell.a} wert={eingaben.get(aktuell.nr) ?? LEER} onChange={(e) => setzeEingabe(aktuell.nr, e)} />

      <div className="probe-nav">
        <button type="button" className="button button--quiet" disabled={pos === 0} onClick={() => setPos(pos - 1)}>
          {'Vorherige '}
          <span className="visually-hidden">Aufgabe</span>
        </button>
        {pos + 1 < aufgaben.length ? (
          <button type="button" className="button" onClick={() => setPos(pos + 1)}>
            {'Nächste '}
            <span className="visually-hidden">Aufgabe</span>
          </button>
        ) : (
          <button type="button" className="button" onClick={abgeben}>
            Probe abgeben
          </button>
        )}
      </div>
    </Rahmen>
  );
}
