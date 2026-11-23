import { useEffect, useId, useMemo, useRef } from 'react';
import { glutSerie } from '../../lib/streak';
import { useAppData } from '../../state/AppData';
import { useBewegungErlaubt } from '../bewegung';

export type GlutZustand = 'brennt' | 'glimmt' | 'kalt';

/** Eigene Flamme: äußere Zunge und heller Kern. Farben kommen aus CSS (data-zustand am Elternelement). */
function Flamme() {
  const id = useId();
  return (
    <svg className="flamme" viewBox="0 0 48 64" width="48" height="64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-aussen`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="flamme__stop-a" />
          <stop offset="1" className="flamme__stop-b" />
        </linearGradient>
        <linearGradient id={`${id}-kern`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" className="flamme__stop-c" />
          <stop offset="1" className="flamme__stop-d" />
        </linearGradient>
      </defs>
      <g className="flamme__koerper">
        <path
          className="flamme__aussen"
          fill={`url(#${id}-aussen)`}
          d="M24 2c3 12 16 20 16 38 0 13-7.2 22-16 22S8 53 8 40c0-10 5-16 8-22 1 7 3.5 10 6 11-2-9-1-19 2-27z"
        />
        <path
          className="flamme__kern"
          fill={`url(#${id}-kern)`}
          d="M24 30c2.5 7 8 10 8 18 0 6-3.6 10-8 10s-8-4-8-10c0-5 3-8 4.5-12 1 3.5 2.5 5 4 5.5-1-4-1.5-7.5-.5-11.5z"
        />
      </g>
    </svg>
  );
}

interface Funke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  leben: number;
  dauer: number;
  r: number;
  ton: number;
}

/**
 * Aufsteigende Funken hinter der Glut-Anzeige (Canvas, ~1 kB). Läuft nur, solange der Tab sichtbar ist;
 * wird bei reduced motion gar nicht erst eingebaut (siehe Glut).
 */
function Funken({ dichte }: { dichte: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let breite = 0;
    let hoehe = 0;
    const groesse = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      breite = canvas.clientWidth;
      hoehe = canvas.clientHeight;
      canvas.width = Math.round(breite * dpr);
      canvas.height = Math.round(hoehe * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    groesse();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(groesse) : null;
    ro?.observe(canvas);

    // Funken entstehen nahe der Flamme (links unten) und streuen beim Aufsteigen
    const neu = (): Funke => ({
      x: 40 + (Math.random() - 0.3) * Math.min(breite * 0.5, 180),
      y: hoehe + Math.random() * 12,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(0.35 + Math.random() * 0.6),
      leben: 0,
      dauer: 160 + Math.random() * 200,
      r: 0.6 + Math.random() * 1.4,
      ton: 22 + Math.random() * 22,
    });
    const funken: Funke[] = Array.from({ length: dichte }, () => {
      const f = neu();
      f.leben = Math.random() * f.dauer;
      f.y = hoehe - (f.leben / f.dauer) * hoehe;
      return f;
    });

    let rahmen = 0;
    let zuletzt = performance.now();
    const schritt = (t: number) => {
      // dt in 60-Hz-Frames, gedeckelt, damit nach einer Pause nichts springt
      const dt = Math.min((t - zuletzt) / 16.67, 3);
      zuletzt = t;
      ctx.clearRect(0, 0, breite, hoehe);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < funken.length; i++) {
        let f = funken[i]!;
        f.leben += dt;
        if (f.leben >= f.dauer || f.y < -10) f = funken[i] = neu();
        f.vx += (Math.random() - 0.5) * 0.04 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const p = f.leben / f.dauer;
        // ein- und ausblenden, dazu leichtes Flackern
        const a = Math.min(1, p * 6) * (1 - p) * (0.7 + Math.random() * 0.3);
        ctx.fillStyle = `hsla(${f.ton}, 100%, ${62 + (1 - p) * 18}%, ${a})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - p * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      rahmen = requestAnimationFrame(schritt);
    };
    const start = () => {
      cancelAnimationFrame(rahmen);
      if (document.visibilityState === 'hidden') return;
      zuletzt = performance.now();
      rahmen = requestAnimationFrame(schritt);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      cancelAnimationFrame(rahmen);
      document.removeEventListener('visibilitychange', start);
      ro?.disconnect();
    };
  }, [dichte]);
  return <canvas ref={ref} className="funken" aria-hidden="true" />;
}

/** „Glut“-Serie auf der Startseite: Flamme + Zahl der Lerntage in Folge. */
export function Glut() {
  const id = useId();
  const { ereignisse, jetzt } = useAppData();
  const bewegung = useBewegungErlaubt();
  const { tage, heuteGelernt } = useMemo(() => glutSerie(ereignisse, jetzt), [ereignisse, jetzt]);
  const zustand: GlutZustand = heuteGelernt ? 'brennt' : tage > 0 ? 'glimmt' : 'kalt';
  const einheit = `${tage === 1 ? 'Tag' : 'Tage'} in Folge`;
  const hinweis =
    zustand === 'glimmt'
      ? 'Heute noch nicht gelernt – halte die Glut am Leben'
      : zustand === 'kalt'
        ? 'Lern heute eine Karte, dann fängt sie an zu glühen'
        : null;

  return (
    <section className="glut" aria-labelledby={id} data-zustand={zustand}>
      <h2 id={id} className="visually-hidden">Glut</h2>
      {bewegung && zustand !== 'kalt' && <Funken dichte={zustand === 'brennt' ? 28 : 10} />}
      <Flamme />
      <div className="glut__text">
        {tage > 0 ? (
          <p className="glut__satz">
            <span className="visually-hidden">{`${tage} ${einheit}`}</span>
            <span className="glut__zahl" aria-hidden="true">{tage}</span>
            <span className="glut__einheit" aria-hidden="true">{einheit}</span>
          </p>
        ) : (
          <p className="glut__satz glut__satz--leer">Noch keine Glut</p>
        )}
        {hinweis && <p className="glut__hinweis">{hinweis}</p>}
      </div>
    </section>
  );
}
