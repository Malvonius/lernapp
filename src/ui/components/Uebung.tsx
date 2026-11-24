import { useRef, useState, type ReactNode } from 'react';
import type { Exercise } from '../../format/types';
import type { AskBobElement } from '../../lib/askBob';
import { pruefeEingabe, pruefeMc } from '../../lib/check';
import { formatPunkte, teilPunkte, type Stufe } from '../../lib/probe';
import { useAppData } from '../../state/AppData';
import { Markdown } from './Markdown';

/** Zustand der Übung für den Aktions-Slot: ob sie beantwortet ist und das Element für „Frag Bob“ */
export interface UebungStand {
  beantwortet: boolean;
  element: AskBobElement;
}

export interface UebungProps {
  ex: Exercise;
  /** Wird einmal mit dem Ergebnis aufgerufen (für den Prüfungsmodus) */
  onErgebnis?: (richtig: boolean) => void;
  /** false: `record` wird nicht aufgerufen (der Aufrufer steuert die Aufzeichnung). Standard: true */
  aufzeichnen?: boolean;
  /** Slot für Zusatzaktionen, z. B. „Frag Bob“; als Funktion bekommt er den aktuellen Stand */
  aktion?: ReactNode | ((stand: UebungStand) => ReactNode);
  /**
   * Probe-Schularbeit: `schritte`/`offen` werden in drei Stufen selbst eingeschätzt (volle, halbe, keine Punkte),
   * die Lösung erscheint erst auf „Lösung zeigen“. Gemeldet wird zusätzlich `richtig` = volle Punkte.
   */
  onStufe?: (stufe: Stufe) => void;
}

const STUFE_TEXT: Record<Stufe, string> = { voll: 'Volle Punkte', teilweise: 'Teilweise', keine: 'Keine Punkte' };

function Stufenwahl({ punkte, onWahl }: { punkte: number; onWahl: (s: Stufe) => void }) {
  const wert: Record<Stufe, number> = { voll: punkte, teilweise: teilPunkte(punkte), keine: 0 };
  return (
    <div className="stufenwahl" role="group" aria-label="Wie viele Punkte hättest du bekommen?">
      <p className="stufenwahl__frage">Wie viele Punkte hättest du bekommen?</p>
      <div className="stufenwahl__knoepfe">
        {(['voll', 'teilweise', 'keine'] as const).map((s) => (
          <button key={s} type="button" className={`stufenwahl__knopf stufenwahl__knopf--${s}`} onClick={() => onWahl(s)}>
            {STUFE_TEXT[s]}
            <small>{formatPunkte(wert[s])} P.</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Urteil({ richtig }: { richtig: boolean }) {
  return (
    <p className={`uebung__urteil ${richtig ? 'uebung__urteil--richtig' : 'uebung__urteil--falsch'}`} role="status">
      {richtig ? 'Richtig' : 'Nicht richtig'}
    </p>
  );
}

function Selbsteinschaetzung({ onWahl }: { onWahl: (richtig: boolean) => void }) {
  return (
    <div className="uebung__zeile">
      <button type="button" className="button" onClick={() => onWahl(true)}>
        Hab ich gekonnt
      </button>
      <button type="button" className="button button--quiet" onClick={() => onWahl(false)}>
        Nicht gekonnt
      </button>
    </div>
  );
}

/**
 * Eine Übung der vier Typen (eingabe, schritte, mc, offen). Das Ergebnis wird genau einmal gemeldet:
 * an `onErgebnis` und (wenn `aufzeichnen` und eine id da ist) an `record`.
 */
function UebungInhalt({ ex, onErgebnis, aufzeichnen = true, aktion, onStufe }: UebungProps) {
  const { record } = useAppData();
  const [ergebnis, setErgebnis] = useState<boolean | null>(null);
  const fertig = useRef(false);
  const [speicherFehler, setSpeicherFehler] = useState(false);

  const [eingabe, setEingabe] = useState('');
  const [aufgedeckt, setAufgedeckt] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<number[]>([]);
  const [notiz, setNotiz] = useState('');
  const [musterZeigen, setMusterZeigen] = useState(false);
  const [stufe, setStufe] = useState<Stufe | null>(null);
  const melde = (richtig: boolean) => {
    if (fertig.current) return;
    fertig.current = true;
    setErgebnis(richtig);
    if (aufzeichnen && ex.id) {
      void Promise.resolve(record({ art: 'uebung', ziel: ex.id, richtig })).catch(() => setSpeicherFehler(true));
    }
    onErgebnis?.(richtig);
  };

  const dreistufig = onStufe !== undefined;
  const waehleStufe = (s: Stufe) => {
    if (fertig.current) return;
    setStufe(s);
    onStufe?.(s);
    melde(s === 'voll');
  };
  const selbst = dreistufig ? <Stufenwahl punkte={ex.punkte ?? 0} onWahl={waehleStufe} /> : <Selbsteinschaetzung onWahl={melde} />;
  const selbstUrteil = (richtig: boolean) => (
    <p className="uebung__urteil" role="status">
      {stufe ? STUFE_TEXT[stufe] : richtig ? 'Gekonnt' : 'Nicht gekonnt'}
    </p>
  );

  const schritte = ex.schritte ?? [];
  const optionen = ex.optionen ?? [];
  const richtige = new Set(ex.richtig ?? []);

  const loesungText = (): string | undefined => {
    if (ex.typ === 'eingabe') return ex.loesung === undefined ? undefined : String(ex.loesung);
    if (ex.typ === 'offen') return ex.musterloesung;
    if (ex.typ === 'schritte') return schritte.length ? schritte.map((s, i) => `${i + 1}. ${s}`).join('\n') : undefined;
    return optionen.filter((_, i) => richtige.has(i)).join('; ') || undefined;
  };
  const meineAntwort = (): string | undefined => {
    const t = ex.typ === 'eingabe' ? eingabe : ex.typ === 'offen' ? notiz : ex.typ === 'mc' ? gewaehlt.map((i) => optionen[i]).join('; ') : '';
    return t.trim() || undefined;
  };
  const aktionInhalt =
    typeof aktion === 'function'
      ? aktion({ beantwortet: ergebnis !== null, element: { art: 'uebung', frage: ex.frage, antwort: loesungText(), meineAntwort: meineAntwort() } })
      : aktion;

  return (
    <article className="uebung">
      <div className="uebung__frage">
        <Markdown text={ex.frage} />
      </div>

      {ex.typ === 'eingabe' && (
        <>
          <input
            type="text"
            className="uebung__eingabe"
            aria-label="Deine Antwort"
            inputMode="text"
            autoComplete="off"
            value={eingabe}
            disabled={ergebnis !== null}
            onChange={(e) => setEingabe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ergebnis === null && eingabe.trim()) melde(pruefeEingabe(ex, eingabe));
            }}
          />
          {ergebnis === null ? (
            <button type="button" className="button" disabled={!eingabe.trim()} onClick={() => melde(pruefeEingabe(ex, eingabe))}>
              Prüfen
            </button>
          ) : (
            <>
              <Urteil richtig={ergebnis} />
              {ex.loesung !== undefined && <p className="uebung__loesung">Lösung: {typeof ex.loesung === 'number' ? String(ex.loesung).replace('.', ',') : ex.loesung}</p>}
            </>
          )}
        </>
      )}

      {ex.typ === 'schritte' && dreistufig && aufgedeckt === 0 && (
        <>
          <textarea className="uebung__eingabe" aria-label="Deine Notizen" rows={4} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
          <button type="button" className="button" onClick={() => setAufgedeckt(schritte.length)}>
            Lösung zeigen
          </button>
        </>
      )}

      {ex.typ === 'schritte' && (!dreistufig || aufgedeckt > 0) && (
        <>
          {schritte.length > 0 && (
            <ol className="uebung__schritte">
              {schritte.slice(0, aufgedeckt).map((s, i) => (
                <li key={i}>
                  <Markdown text={s} />
                </li>
              ))}
            </ol>
          )}
          {aufgedeckt < schritte.length ? (
            <button type="button" className="button" onClick={() => setAufgedeckt((n) => n + 1)}>
              Nächsten Schritt zeigen
            </button>
          ) : ergebnis === null ? (
            selbst
          ) : null}
          {ergebnis !== null && selbstUrteil(ergebnis)}
        </>
      )}

      {ex.typ === 'mc' && (
        <>
          <ul className="uebung__optionen">
            {optionen.map((o, i) => {
              const istRichtig = richtige.has(i);
              return (
                <li key={i} className={ergebnis !== null && istRichtig ? 'uebung__option uebung__option--richtig' : 'uebung__option'}>
                  <label>
                    <input
                      type="checkbox"
                      checked={gewaehlt.includes(i)}
                      disabled={ergebnis !== null}
                      onChange={() => setGewaehlt((alt) => (alt.includes(i) ? alt.filter((x) => x !== i) : [...alt, i]))}
                    />
                    <Markdown text={o} />
                  </label>
                  {ergebnis !== null && istRichtig && <span className="uebung__marke">Richtige Antwort</span>}
                </li>
              );
            })}
          </ul>
          {ergebnis === null ? (
            <button type="button" className="button" disabled={gewaehlt.length === 0} onClick={() => melde(pruefeMc(ex, gewaehlt))}>
              Prüfen
            </button>
          ) : (
            <Urteil richtig={ergebnis} />
          )}
        </>
      )}

      {ex.typ === 'offen' && (
        <>
          <textarea
            className="uebung__eingabe"
            aria-label="Deine Notizen"
            rows={4}
            value={notiz}
            disabled={ergebnis !== null}
            onChange={(e) => setNotiz(e.target.value)}
          />
          {!musterZeigen ? (
            <button type="button" className="button" onClick={() => setMusterZeigen(true)}>
              {dreistufig ? 'Lösung zeigen' : 'Musterlösung zeigen'}
            </button>
          ) : (
            <>
              <div className="uebung__muster">{ex.musterloesung ? <Markdown text={ex.musterloesung} /> : <p>Keine Musterlösung hinterlegt.</p>}</div>
              {ergebnis === null ? selbst : selbstUrteil(ergebnis)}
            </>
          )}
        </>
      )}

      {speicherFehler && <p className="uebung__fehler" role="alert">Ergebnis konnte nicht gespeichert werden</p>}

      {aktionInhalt ? <div className="uebung__aktion">{aktionInhalt}</div> : null}
    </article>
  );
}

/** Der Zustand gehört zu einer Übung: bei anderer Übung wird die Komponente über den key neu aufgebaut. */
export function Uebung(props: UebungProps) {
  const { ex } = props;
  return <UebungInhalt key={ex.id ?? `z${ex.zeile}:${ex.frage}`} {...props} />;
}
