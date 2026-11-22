import { useId } from 'react';

/** Minimaler Einrichten-Screen (Task 1). Task 6 ergänzt Gerätename, Verbindungsprüfung, Theme und Sync. */
export function Einrichten() {
  const tokenId = useId();
  const hintId = useId();
  return (
    <section className="screen" aria-labelledby={`${tokenId}-h`}>
      <h1 id={`${tokenId}-h`}>Einrichten</h1>
      <p className="lead">Damit die App deinen Lernstoff laden kann, braucht sie Zugriff auf dein Repo auf GitHub.</p>
      <div className="field">
        <label htmlFor={tokenId}>GitHub-Token</label>
        <input
          id={tokenId}
          className="input"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby={hintId}
        />
        <p id={hintId} className="hint">Das Token bleibt nur auf diesem Gerät gespeichert.</p>
      </div>
    </section>
  );
}
