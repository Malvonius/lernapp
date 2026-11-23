import type { Ereignis } from './progress';

/** Kalendertag in Wien als „YYYY-MM-DD“ (en-CA liefert genau dieses Format). */
const WIEN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' });

export function wienerTag(d: Date): string {
  return WIEN.format(d);
}

/** Vortag eines „YYYY-MM-DD“-Tags; rein kalendarisch in UTC gerechnet, damit Zeitumstellungen egal sind. */
function vortag(tag: string): string {
  const d = new Date(`${tag}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface GlutSerie {
  /** Aufeinanderfolgende Lerntage bis heute (oder bis gestern, wenn heute noch nichts gelernt wurde) */
  tage: number;
  heuteGelernt: boolean;
}

/**
 * „Glut“-Serie: Lerntage in Folge (Wiener Kalendertage). Ein Tag zählt, wenn es mindestens ein
 * Ereignis `karte` oder `uebung` gibt, egal von welchem Gerät. Ohne Bewertung heute zählt die Serie
 * bis gestern weiter (sie glimmt). Tage nach heute und ungültige Zeiten zählen nicht.
 */
export function glutSerie(ereignisse: readonly Ereignis[], jetzt: Date): GlutSerie {
  const heute = wienerTag(jetzt);
  const tage = new Set<string>();
  for (const e of ereignisse) {
    if (e.art !== 'karte' && e.art !== 'uebung') continue;
    const t = Date.parse(e.zeit);
    if (Number.isNaN(t)) continue;
    const tag = wienerTag(new Date(t));
    // Tage nach heute (Uhr eines anderen Geräts geht vor) zählen nicht; ISO-Tage lassen sich als Text vergleichen
    if (tag <= heute) tage.add(tag);
  }
  const heuteGelernt = tage.has(heute);
  let tag = heuteGelernt ? heute : vortag(heute);
  let n = 0;
  while (tage.has(tag)) {
    n++;
    tag = vortag(tag);
  }
  return { tage: n, heuteGelernt };
}
