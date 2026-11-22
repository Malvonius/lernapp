import type { Exercise } from '../format/types';

const GRUPPEN_LEER = /[   ]/;

/** Zahl am Anfang: Vorzeichen, Ziffern, dazwischen Trenner (Punkt, Komma, Leerzeichen, NBSP). */
const ZAHL_ANFANG = /^[+-]?\d[\d .,  ]*/;

/**
 * Liest eine Zahl aus freier (deutscher) Eingabe. Gibt `null` zurück, wenn keine Zahl erkennbar ist.
 *
 * Regeln:
 * - Nachgestellter Text (Einheiten/Symbole wie %, €, mm, Ω, kg) wird ignoriert; der Text muss mit der Zahl beginnen.
 * - „−“ (Unicode-Minus) und „–“ zählen als Minus.
 * - Tausendertrenner sind Punkt, Leerzeichen oder NBSP, aber nur in sauberen 3er-Gruppen (`24.703`, `24 703`).
 * - Mit Komma: Komma = Dezimalstelle, Punkte davor = Tausender („24.703,21“ → 24703.21).
 *   Umgekehrt (englisch, „24,703.21“) wird ebenfalls erkannt.
 * - Ein einzelner Punkt ohne Komma ist ein Dezimalpunkt („1.35“ → 1.35, auch „24.703“ → 24.703);
 *   mehrere Punkte müssen saubere Tausendergruppen sein („1.234.567“).
 * - Leerzeichen innerhalb der Zahl sind nur als Tausendertrenner gültig, sonst ist die Eingabe ungültig („1 2“ → null).
 */
export function parseZahl(eingabe: string): number | null {
  return parseMitEinheit(eingabe)?.wert ?? null;
}

/** Nachgestellte Einheit/Symbol in der Eingabe: Buchstaben, %, €, $, °, µ, Ω, ², ³, „/“ und „·“ (z. B. „m/s“); keine Ziffern („1,5e3“ → ungültig). */
const EINHEIT_EINGABE = /^[\p{L}%€$°µΩ²³][\p{L}%€$°µΩ²³/·]*\.?$/u;

/** Bekannte Einheiten für die Lösungsseite („2x“ oder „3 Schritte“ sind keine Einheit, sondern Text). */
const EINHEIT_LOESUNG =
  /^(%|€|\$|°[CF]?|(?:[kKmMµcdnG]?(?:m|g|s|A|V|W|Hz|N|J|Pa|Ω|F|H|T|l|L|C|B))[²³]?|ha|min|h|kWh|bar|rad|K|mol|dB|ppm|EUR|USD)(\/[a-zA-Zµ]+[²³]?)?$/;

function parseMitEinheit(eingabe: string): { wert: number; einheit: string } | null {
  const s = eingabe.trim().replace(/[−–]/g, '-');
  const m = ZAHL_ANFANG.exec(s);
  if (!m) return null;
  const einheit = s.slice(m[0].length).trim();
  if (einheit !== '' && !EINHEIT_EINGABE.test(einheit)) return null;
  // Abschließende Trenner gehören nicht zur Zahl („3.“, „5 m“ → „5“)
  let z = m[0].replace(/[ .,  ]+$/, '');
  let vorzeichen = 1;
  if (z.startsWith('-')) {
    vorzeichen = -1;
    z = z.slice(1);
  } else if (z.startsWith('+')) {
    z = z.slice(1);
  }
  if (z === '') return null;

  // Leerzeichen sind nur als Tausendertrenner erlaubt
  if (GRUPPEN_LEER.test(z)) {
    if (!/^\d{1,3}([   ]\d{3})+([.,]\d+)?$/.test(z)) return null;
    z = z.replace(/[   ]/g, '');
  }

  const hatKomma = z.includes(',');
  const hatPunkt = z.includes('.');
  let normal: string;
  if (hatKomma && hatPunkt) {
    if (z.lastIndexOf(',') > z.lastIndexOf('.')) {
      if (!/^\d{1,3}(\.\d{3})+,\d+$/.test(z)) return null;
      normal = z.replace(/\./g, '').replace(',', '.');
    } else {
      if (!/^\d{1,3}(,\d{3})+\.\d+$/.test(z)) return null;
      normal = z.replace(/,/g, '');
    }
  } else if (hatKomma) {
    if (!/^\d+,\d+$/.test(z)) return null;
    normal = z.replace(',', '.');
  } else if (hatPunkt) {
    if (/^\d+\.\d+$/.test(z)) normal = z;
    else if (/^\d{1,3}(\.\d{3})+$/.test(z)) normal = z.replace(/\./g, '');
    else return null;
  } else {
    normal = z;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? { wert: vorzeichen * n, einheit } : null;
}

function normalisiereText(t: string): string {
  return t.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Bei Zahl-Lösung: |x − Lösung| ≤ Toleranz (Standard 1e-9). Bei Text-Lösung: getrimmt, ohne Groß/Klein, Whitespace zusammengefasst. */
export function pruefeEingabe(ex: Exercise, eingabe: string): boolean {
  const l = ex.loesung;
  if (l === undefined) return false;
  let sollZahl: number | null = null;
  if (typeof l === 'number') sollZahl = l;
  else {
    // String-Lösung ist numerisch, wenn sie eine Zahl mit bekannter Einheit (oder ohne) ist, z. B. „1,35 %“
    const p = parseMitEinheit(l);
    if (p && (p.einheit === '' || EINHEIT_LOESUNG.test(p.einheit))) sollZahl = p.wert;
  }

  if (sollZahl !== null) {
    const x = parseZahl(eingabe);
    if (x === null) return false;
    const tol = ex.toleranz ?? 1e-9;
    // kleiner Zuschlag gegen Gleitkomma-Rauschen an der Toleranzgrenze
    return Math.abs(x - sollZahl) <= tol + 1e-12;
  }
  return normalisiereText(eingabe) === normalisiereText(String(l));
}

/** Richtig nur bei genau der richtigen Menge. */
export function pruefeMc(ex: Exercise, gewaehlt: number[]): boolean {
  const soll = new Set(ex.richtig ?? []);
  const ist = new Set(gewaehlt);
  return soll.size === ist.size && [...soll].every((i) => ist.has(i));
}
