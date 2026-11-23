import { useEffect, useState } from 'react';

/** Feder ohne Überschwingen (Apple: damping 1.0) bzw. leichtes Nachfedern, als Kurven für WAAPI/CSS. */
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
export const EASE_SHEET = 'cubic-bezier(0.32, 0.72, 0, 1)';

const abfrage = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Momentaufnahme für Event-Handler: darf jetzt animiert werden? Ohne matchMedia/animate (jsdom) nie. */
export function bewegungErlaubt(el?: Element | null): boolean {
  const q = abfrage();
  if (!q || q.matches) return false;
  return !el || typeof (el as HTMLElement).animate === 'function';
}

/** true, solange Bewegung erlaubt ist (prefers-reduced-motion nicht gesetzt). Ohne matchMedia (Tests): false. */
export function useBewegungErlaubt(): boolean {
  const [q] = useState(abfrage);
  const [erlaubt, setErlaubt] = useState(() => (q ? !q.matches : false));
  useEffect(() => {
    if (!q) return;
    const an = () => setErlaubt(!q.matches);
    q.addEventListener('change', an);
    return () => q.removeEventListener('change', an);
  }, [q]);
  return erlaubt;
}
