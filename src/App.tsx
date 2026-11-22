import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { Einrichten } from './screens/Einrichten';
import { Platzhalter } from './screens/Platzhalter';

/**
 * App-Gerüst mit allen Routen. Noch ohne Token-Speicher: `/` zeigt deshalb den Einrichten-Screen.
 * Task 6 ergänzt den App-Zustand (Token aus IndexedDB) und die echte Startseite.
 */
export function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-bar">
          <Link to="/" className="wordmark">Lernapp</Link>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Einrichten />} />
            <Route path="/fach/:fachId" element={<Platzhalter titel="Fach" />} />
            <Route path="/thema/:fachId/:themaId" element={<Platzhalter titel="Thema" />} />
            <Route path="/wiederholen" element={<Platzhalter titel="Wiederholen" />} />
            <Route path="/pruefung" element={<Platzhalter titel="Prüfung" />} />
            <Route path="/suche" element={<Platzhalter titel="Suche" />} />
            <Route path="/einstellungen" element={<Einrichten />} />
            <Route path="*" element={<Platzhalter titel="Seite nicht gefunden" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
