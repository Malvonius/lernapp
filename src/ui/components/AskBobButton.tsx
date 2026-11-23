import { useEffect, useId, useRef, useState } from 'react';
import { bauePrompt, uebergeben, type AskBobElement, type Uebergabe } from '../../lib/askBob';
import { bewegungErlaubt, EASE_SHEET } from '../bewegung';

export interface AskBobButtonProps {
  fach: string;
  thema: string;
  zusammenfassung: string;
  element?: AskBobElement;
}

const MELDUNG: Partial<Record<Uebergabe, string>> = {
  geteilt: 'In die Claude-App geteilt',
  kopiert: 'Kopiert, in Claude einfügen',
  manuell: 'Kopieren ging nicht. Markiere den Text unten und kopiere ihn selbst, dann in Claude einfügen.',
};

/**
 * „Frag Bob“: Frage eintippen, Lernkontext dazu, an die Claude-App übergeben. Die App sendet selbst nichts an einen Server.
 * Das Feld liegt in einem modalen <dialog>, das als Sheet von unten hereingleitet (Fokus bleibt im Sheet,
 * Esc oder Tippen daneben schließt, danach steht der Fokus wieder auf dem Knopf).
 */
export function AskBobButton({ fach, thema, zusammenfassung, element }: AskBobButtonProps) {
  const id = useId();
  const knopf = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [offen, setOffen] = useState(false);
  const [frage, setFrage] = useState('');
  const [ergebnis, setErgebnis] = useState<Uebergabe | null>(null);
  const [text, setText] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const schliesst = useRef(false);

  useEffect(() => {
    const d = dialog.current;
    if (!offen || !d) return;
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal();
    } else {
      d.setAttribute('open', '');
    }
    return () => {
      if (d.open && typeof d.close === 'function') d.close();
    };
  }, [offen]);

  const fertigSchliessen = () => {
    schliesst.current = false;
    const d = dialog.current;
    if (d?.open && typeof d.close === 'function') d.close();
    setOffen(false);
    knopf.current?.focus();
  };

  /** Gleitet den Weg zurück, den es gekommen ist; ohne Bewegung sofort. */
  const schliessen = () => {
    const d = dialog.current;
    if (schliesst.current) return;
    if (!d || !bewegungErlaubt(d)) return fertigSchliessen();
    schliesst.current = true;
    const hoehe = d.getBoundingClientRect().height + 24;
    const a = d.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${hoehe}px)` }], { duration: 220, easing: EASE_SHEET, fill: 'forwards' });
    a.onfinish = a.oncancel = fertigSchliessen;
  };

  const senden = async () => {
    if (!frage.trim() || laeuft) return;
    const prompt = bauePrompt({ fach, thema, zusammenfassung, element, frage });
    setLaeuft(true);
    setErgebnis(null);
    try {
      setText(prompt);
      setErgebnis(await uebergeben(prompt));
    } finally {
      setLaeuft(false);
    }
  };

  const meldung = ergebnis ? MELDUNG[ergebnis] : undefined;

  return (
    <>
      <button ref={knopf} type="button" className="button button--quiet" aria-expanded={offen} aria-haspopup="dialog" onClick={() => setOffen(true)}>
        Frag Bob
      </button>
      {offen && (
        <dialog
          ref={dialog}
          className="sheet"
          aria-labelledby={`${id}-titel`}
          onCancel={(e) => {
            e.preventDefault();
            schliessen();
          }}
          onClick={(e) => {
            // Klick auf den abgedunkelten Hintergrund (::backdrop) trifft das <dialog> selbst
            if (e.target === e.currentTarget) schliessen();
          }}
        >
          <div className="askbob">
            <div className="sheet__griff" aria-hidden="true" />
            <h2 id={`${id}-titel`} className="sheet__titel">Frag Bob</h2>
            <p className="sheet__kontext">
              {element ? (element.art === 'karte' ? 'Zu dieser Karte' : 'Zu dieser Übung') : 'Zum Thema'} · {thema}
            </p>
            <label htmlFor={`${id}-frage`}>Deine Frage</label>
            <textarea
              id={`${id}-frage`}
              className="askbob__feld"
              rows={3}
              value={frage}
              onChange={(e) => {
                setFrage(e.target.value);
                setErgebnis(null);
              }}
            />
            <div className="askbob__zeile">
              <button type="button" className="button" disabled={!frage.trim() || laeuft} onClick={() => void senden()}>
                An Claude übergeben
              </button>
              <button type="button" className="button button--quiet" onClick={schliessen}>
                Schließen
              </button>
            </div>
            {meldung && (
              <p className="askbob__meldung" role="status">
                {meldung}
              </p>
            )}
            {ergebnis === 'manuell' && (
              <textarea className="askbob__feld" aria-label="Text zum Kopieren" readOnly rows={6} value={text} onFocus={(e) => e.currentTarget.select()} />
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
