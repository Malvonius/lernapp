import { useId, useState, type FormEvent } from 'react';
import { REPO } from '../../lib/config';
import { GitHubError } from '../../lib/github';
import { normalizeGeraet } from '../../lib/progressSync';
import { useAppData } from '../../state/AppData';
import { fehlerText, SyncBanner } from '../components/SyncBanner';

const geraetVorschlag = () => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'handy' : 'pc');

type Meldung = { art: 'ok' | 'fehler'; text: string } | null;

/** Einrichten (ohne Token) bzw. Einstellungen: Token, Gerätename, Theme, Sync. */
export function Einstellungen() {
  const { hatToken, geraet, theme, syncStatus, index, pruefeVerbindung, speichereZugang, setzeTheme, sync } = useAppData();
  const id = useId();
  const [token, setToken] = useState('');
  const [name, setName] = useState(geraet ?? geraetVorschlag());
  const [prueft, setPrueft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung>(null);

  let normalisiert = '';
  try {
    normalisiert = normalizeGeraet(name.trim());
  } catch {
    normalisiert = '';
  }

  async function pruefen(ev: FormEvent) {
    ev.preventDefault();
    setMeldung(null);
    if (!normalisiert) {
      setMeldung({ art: 'fehler', text: 'Gerätename darf nicht leer sein.' });
      return;
    }
    if (!token.trim() && !hatToken) {
      setMeldung({ art: 'fehler', text: 'Bitte ein GitHub-Token eintragen.' });
      return;
    }
    setPrueft(true);
    try {
      await pruefeVerbindung(token.trim() || undefined);
      await speichereZugang({ token: token.trim() || undefined, geraet: normalisiert });
      setToken('');
      setMeldung({ art: 'ok', text: 'Verbindung klappt, gespeichert.' });
      void sync();
    } catch (e) {
      const err = e instanceof GitHubError ? e : new GitHubError('other');
      setMeldung({ art: 'fehler', text: fehlerText(err, index !== null) });
    } finally {
      setPrueft(false);
    }
  }

  const titel = hatToken ? 'Einstellungen' : 'Einrichten';
  const ids = { token: `${id}-token`, tokenHint: `${id}-token-hint`, geraet: `${id}-geraet`, geraetHint: `${id}-geraet-hint` };

  return (
    <section className="screen" aria-labelledby={`${id}-h`}>
      <h1 id={`${id}-h`}>{titel}</h1>
      {hatToken && <SyncBanner mitLink={false} />}
      {!hatToken && <p className="lead">Damit die App deinen Lernstoff laden kann, braucht sie Zugriff auf dein Repo auf GitHub.</p>}

      <form onSubmit={pruefen} noValidate>
        <div className="field">
          <label htmlFor={ids.token}>GitHub-Token</label>
          <input
            id={ids.token}
            className="input"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hatToken ? 'gespeichert' : undefined}
            aria-describedby={ids.tokenHint}
          />
          <p id={ids.tokenHint} className="hint">
            {hatToken ? 'Ein Token ist gespeichert. Leer lassen, um es zu behalten. ' : ''}
            Das Token bleibt nur auf diesem Gerät gespeichert.
          </p>
        </div>

        <details className="anleitung">
          <summary>So erstellst du das Token</summary>
          <ol>
            <li>
              Auf GitHub{' '}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
                ein neues fine-grained Token anlegen
              </a>
              .
            </li>
            <li>Namen und Ablaufdatum wählen.</li>
            <li>
              Bei „Repository access“ <em>Only select repositories</em> wählen und nur{' '}
              <code>
                {REPO.owner}/{REPO.repo}
              </code>{' '}
              ankreuzen.
            </li>
            <li>
              Unter „Repository permissions“ <strong>Contents: Read and write</strong> setzen, sonst nichts.
            </li>
            <li>„Generate token“ drücken, das Token kopieren und oben einfügen.</li>
          </ol>
        </details>

        <div className="field">
          <label htmlFor={ids.geraet}>Gerätename</label>
          <input
            id={ids.geraet}
            className="input"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={ids.geraetHint}
          />
          <p id={ids.geraetHint} className="hint">
            Jedes Gerät braucht einen eigenen Namen{normalisiert ? <> (gespeichert als <code>{normalisiert}</code>)</> : null}.
          </p>
        </div>

        <button type="submit" className="button" disabled={prueft}>
          Verbindung prüfen
        </button>
        {meldung && (
          <p className={`meldung meldung--${meldung.art}`} role={meldung.art === 'fehler' ? 'alert' : 'status'}>
            {meldung.text}
          </p>
        )}
      </form>

      <h2 className="einstellungen-h2">Darstellung</h2>
      <div className="schalter-zeile">
        <span id={`${id}-theme`}>Helles Design</span>
        <button
          type="button"
          role="switch"
          className="schalter"
          aria-checked={theme === 'hell'}
          aria-labelledby={`${id}-theme`}
          onClick={() => void setzeTheme(theme === 'hell' ? 'dunkel' : 'hell')}
        >
          <span className="schalter__knopf" />
        </button>
      </div>

      {hatToken && (
        <>
          <h2 className="einstellungen-h2">Abgleich</h2>
          <button type="button" className="button button--quiet" disabled={syncStatus.laeuft} onClick={() => void sync()}>
            Jetzt synchronisieren
          </button>
          {syncStatus.laeuft && <p className="hint">Wird abgeglichen …</p>}
        </>
      )}
    </section>
  );
}
