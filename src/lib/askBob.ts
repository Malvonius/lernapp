export interface AskBobElement {
  art: 'karte' | 'uebung';
  frage: string;
  antwort?: string;
  meineAntwort?: string;
}

export interface AskBobKontext {
  fach: string;
  thema: string;
  zusammenfassung: string;
  element?: AskBobElement;
  frage: string;
}

export const MAX_ZUSAMMENFASSUNG = 6000;

const kuerze = (text: string) => (text.length > MAX_ZUSAMMENFASSUNG ? `${text.slice(0, MAX_ZUSAMMENFASSUNG)}…` : text);

/** Baut den deutschen Text, der an die Claude-App übergeben wird. */
export function bauePrompt(ctx: AskBobKontext): string {
  const teile = [
    `Ich lerne für ${ctx.fach}, Thema ${ctx.thema}. Hier ist mein Lernstoff:`,
    kuerze(ctx.zusammenfassung.trim()),
  ];
  const e = ctx.element;
  if (e) {
    const zeilen = [`Ich arbeite gerade an dieser ${e.art === 'karte' ? 'Lernkarte' : 'Übung'}:`, `Frage: ${e.frage}`];
    if (e.antwort) zeilen.push(`${e.art === 'karte' ? 'Antwort' : 'Lösung'}: ${e.antwort}`);
    if (e.meineAntwort) zeilen.push(`Meine Antwort: ${e.meineAntwort}`);
    teile.push(zeilen.join('\n'));
  }
  teile.push(`Meine Frage: ${ctx.frage.trim()}`);
  teile.push('Bitte antworte auf Deutsch und einfach erklärt, so wie für einen HTL-Schüler.');
  return teile.join('\n\n');
}

export type Uebergabe = 'geteilt' | 'kopiert' | 'abgebrochen' | 'manuell';

/**
 * Übergibt den Text an die Claude-App (Teilen-Menü) oder kopiert ihn und öffnet claude.ai.
 * 'manuell': keine Zwischenablage verfügbar, der Aufrufer zeigt den Text zum Selbstkopieren.
 * Es werden keine eigenen Netzwerkanfragen gemacht.
 */
export async function uebergeben(text: string): Promise<Uebergabe> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'geteilt';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'abgebrochen';
      // anderer Fehler: weiter mit der Zwischenablage
    }
  }
  try {
    if (!navigator.clipboard?.writeText) return 'manuell';
    await navigator.clipboard.writeText(text);
  } catch {
    return 'manuell';
  }
  window.open('https://claude.ai/new', '_blank', 'noopener');
  return 'kopiert';
}
