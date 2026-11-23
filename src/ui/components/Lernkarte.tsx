import { useEffect, useRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Bewertung } from '../../lib/progress';
import { bewegungErlaubt, EASE_OUT } from '../bewegung';
import { Markdown } from './Markdown';

export const BEWERTUNGEN: { wert: Bewertung; label: string }[] = [
  { wert: 1, label: 'Nochmal' },
  { wert: 2, label: 'Schwer' },
  { wert: 3, label: 'Gut' },
  { wert: 4, label: 'Einfach' },
];

// Tasten in Eingabefeldern und im „Frag Bob“-Sheet gehören nicht der Karte
const istEingabe = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest('dialog') !== null);

const DREH = (grad: number) => `perspective(1400px) rotateY(${grad}deg)`;

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

/**
 * Eine Lernkarte: Frage, „Antwort zeigen“, dann vier Bewertungsknöpfe. Tastatur: Leertaste/Enter deckt auf, 1–4 bewertet.
 * Aufdecken dreht die Karte in 3D: die Vorderseite dreht sich weg (bis 90°, Kante zum Betrachter), in diesem
 * Moment wird die Rückseite gezeigt und dreht sich herein. Ohne Bewegung (reduced motion, Tests) sofort.
 */
export function Lernkarte({ frage, antwort, aufgedeckt, intervalle, onAufdecken, onBewerten, aktion }: LernkarteProps) {
  const karte = useRef<HTMLElement>(null);
  const dreht = useRef(false);
  const aktuell = useRef({ aufgedeckt, onAufdecken, onBewerten, aufdecken: () => {} });
  const aufdecken = () => {
    const el = karte.current;
    if (aktuell.current.aufgedeckt || dreht.current) return;
    if (!el || !bewegungErlaubt(el)) {
      aktuell.current.onAufdecken();
      return;
    }
    dreht.current = true;
    const weg = el.animate([{ transform: DREH(0) }, { transform: DREH(90) }], { duration: 150, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' });
    weg.onfinish = () => {
      if (!karte.current) return;
      // Rückseite im selben Frame rendern, damit zwischen den Hälften nichts aufblitzt
      flushSync(() => aktuell.current.onAufdecken());
      const her = el.animate([{ transform: DREH(-90) }, { transform: DREH(0) }], { duration: 210, easing: EASE_OUT });
      her.onfinish = her.oncancel = () => {
        dreht.current = false;
      };
    };
    weg.oncancel = () => {
      dreht.current = false;
    };
  };
  aktuell.current = { aufgedeckt, onAufdecken, onBewerten, aufdecken };

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || istEingabe(e.target)) return;
      const h = aktuell.current;
      if (!h.aufgedeckt) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          h.aufdecken();
        }
      } else if (e.key >= '1' && e.key <= '4') {
        h.onBewerten(Number(e.key) as Bewertung);
      }
    };
    window.addEventListener('keydown', beiTaste);
    return () => window.removeEventListener('keydown', beiTaste);
  }, []);

  return (
    <article ref={karte} className="lernkarte">
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
        <button type="button" className="button lernkarte__aufdecken" onClick={aufdecken}>
          Antwort zeigen
        </button>
      )}
    </article>
  );
}
