import { useEffect, useRef, type ReactNode } from 'react';
import type { Bewertung } from '../../lib/progress';
import { Markdown } from './Markdown';

export const BEWERTUNGEN: { wert: Bewertung; label: string }[] = [
  { wert: 1, label: 'Nochmal' },
  { wert: 2, label: 'Schwer' },
  { wert: 3, label: 'Gut' },
  { wert: 4, label: 'Einfach' },
];

const istEingabe = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export interface LernkarteProps {
  frage: string;
  antwort: string;
  aufgedeckt: boolean;
  /** Intervall-Text je Bewertung, z. B. „4 Tage“ */
  intervalle: Record<Bewertung, string>;
  onAufdecken(): void;
  onBewerten(b: Bewertung): void;
  /** Slot für Zusatzaktionen auf der Karte (Task 12: „Frag Bob“) */
  aktion?: ReactNode;
}

/** Eine Lernkarte: Frage, „Antwort zeigen“, dann vier Bewertungsknöpfe. Tastatur: Leertaste/Enter deckt auf, 1–4 bewertet. */
export function Lernkarte({ frage, antwort, aufgedeckt, intervalle, onAufdecken, onBewerten, aktion }: LernkarteProps) {
  const aktuell = useRef({ aufgedeckt, onAufdecken, onBewerten });
  aktuell.current = { aufgedeckt, onAufdecken, onBewerten };

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || istEingabe(e.target)) return;
      const h = aktuell.current;
      if (!h.aufgedeckt) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          h.onAufdecken();
        }
      } else if (e.key >= '1' && e.key <= '4') {
        h.onBewerten(Number(e.key) as Bewertung);
      }
    };
    window.addEventListener('keydown', beiTaste);
    return () => window.removeEventListener('keydown', beiTaste);
  }, []);

  return (
    <article className="lernkarte">
      <div className="lernkarte__frage">
        <Markdown text={frage} />
      </div>
      {aufgedeckt && (
        <div className="lernkarte__antwort">
          <Markdown text={antwort} />
        </div>
      )}
      {aktion && <div className="lernkarte__aktion">{aktion}</div>}
      {aufgedeckt ? (
        <div className="bewertung" role="group" aria-label="Bewertung">
          {BEWERTUNGEN.map((b) => (
            <button key={b.wert} type="button" className={`bewertung__knopf bewertung__knopf--${b.wert}`} onClick={() => onBewerten(b.wert)}>
              <span>{b.label}</span>
              <small>{intervalle[b.wert]}</small>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="button lernkarte__aufdecken" onClick={onAufdecken}>
          Antwort zeigen
        </button>
      )}
    </article>
  );
}
