import { useId, useState } from 'react';
import { bauePrompt, uebergeben, type AskBobElement, type Uebergabe } from '../../lib/askBob';

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

/** „Frag Bob“: Frage eintippen, Lernkontext dazu, an die Claude-App übergeben. Die App sendet selbst nichts an einen Server. */
export function AskBobButton({ fach, thema, zusammenfassung, element }: AskBobButtonProps) {
  const id = useId();
  const [offen, setOffen] = useState(false);
  const [frage, setFrage] = useState('');
  const [ergebnis, setErgebnis] = useState<Uebergabe | null>(null);
  const [text, setText] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  if (!offen) {
    return (
      <button type="button" className="button button--quiet" aria-expanded={false} onClick={() => setOffen(true)}>
        Frag Bob
      </button>
    );
  }

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
    <div className="askbob">
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
        <button type="button" className="button button--quiet" onClick={() => setOffen(false)}>
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
  );
}
