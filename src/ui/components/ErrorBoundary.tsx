import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Für Tests: statt `location.reload()` */
  neuLaden?: () => void;
}

/** Fängt Render-Fehler ab: freundliche Seite statt weißem Bildschirm. Fehlertexte werden nicht angezeigt (könnten Inhalte enthalten). */
export class ErrorBoundary extends Component<Props, { kaputt: boolean }> {
  state = { kaputt: false };

  static getDerivedStateFromError() {
    return { kaputt: true };
  }

  render() {
    if (!this.state.kaputt) return this.props.children;
    const neuLaden = this.props.neuLaden ?? (() => window.location.reload());
    return (
      <main>
        <section className="screen">
          <h1>Da ist etwas schiefgelaufen</h1>
          <p className="lead">Die App hat einen Fehler. Neu laden hilft meistens, dein Fortschritt ist auf dem Gerät gespeichert.</p>
          <p>
            <button type="button" className="button" onClick={neuLaden}>
              Neu laden
            </button>
          </p>
          <p>
            <a
              href="#/einstellungen"
              onClick={() => {
                // zu den Einstellungen und neu versuchen (Token oder Gerätename prüfen)
                this.setState({ kaputt: false });
              }}
            >
              Einstellungen
            </a>
          </p>
        </section>
      </main>
    );
  }
}
