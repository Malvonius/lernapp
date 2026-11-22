import { useRef, useState, type ReactNode } from 'react';
import type { Exercise } from '../../format/types';
import { pruefeEingabe, pruefeMc } from '../../lib/check';
import { useAppData } from '../../state/AppData';
import { Markdown } from './Markdown';

export interface UebungProps {
  ex: Exercise;
  /** Wird einmal mit dem Ergebnis aufgerufen (für den Prüfungsmodus) */
  onErgebnis?: (richtig: boolean) => void;
  /** false: `record` wird nicht aufgerufen (der Aufrufer steuert die Aufzeichnung). Standard: true */
  aufzeichnen?: boolean;
  /** Slot für Zusatzaktionen, z. B. „Frag Bob“ */
  aktion?: ReactNode;
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
function UebungInhalt({ ex, onErgebnis, aufzeichnen = true, aktion }: UebungProps) {
  const { record } = useAppData();
  const [ergebnis, setErgebnis] = useState<boolean | null>(null);
  const fertig = useRef(false);
  const [speicherFehler, setSpeicherFehler] = useState(false);

  const [eingabe, setEingabe] = useState('');
  const [aufgedeckt, setAufgedeckt] = useState(0);
  const [gewaehlt, setGewaehlt] = useState<number[]>([]);
  const [notiz, setNotiz] = useState('');
  const [musterZeigen, setMusterZeigen] = useState(false);

  const melde = (richtig: boolean) => {
    if (fertig.current) return;
    fertig.current = true;
    setErgebnis(richtig);
    if (aufzeichnen && ex.id) {
      void Promise.resolve(record({ art: 'uebung', ziel: ex.id, richtig })).catch(() => setSpeicherFehler(true));
    }
    onErgebnis?.(richtig);
  };

  const schritte = ex.schritte ?? [];
  const optionen = ex.optionen ?? [];
  const richtige = new Set(ex.richtig ?? []);

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

      {ex.typ === 'schritte' && (
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
            <Selbsteinschaetzung onWahl={melde} />
          ) : null}
          {ergebnis !== null && <p className="uebung__urteil" role="status">{ergebnis ? 'Gekonnt' : 'Nicht gekonnt'}</p>}
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
              Musterlösung zeigen
            </button>
          ) : (
            <>
              <div className="uebung__muster">{ex.musterloesung ? <Markdown text={ex.musterloesung} /> : <p>Keine Musterlösung hinterlegt.</p>}</div>
              {ergebnis === null ? (
                <Selbsteinschaetzung onWahl={melde} />
              ) : (
                <p className="uebung__urteil" role="status">{ergebnis ? 'Gekonnt' : 'Nicht gekonnt'}</p>
              )}
            </>
          )}
        </>
      )}

      {speicherFehler && <p className="uebung__fehler" role="alert">Ergebnis konnte nicht gespeichert werden</p>}

      {aktion ? <div className="uebung__aktion">{aktion}</div> : null}
    </article>
  );
}

/** Der Zustand gehört zu einer Übung: bei anderer Übung wird die Komponente über den key neu aufgebaut. */
export function Uebung(props: UebungProps) {
  const { ex } = props;
  return <UebungInhalt key={ex.id ?? `z${ex.zeile}:${ex.frage}`} {...props} />;
}
