import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { AppDataProvider, useAppData, type AppDataProviderProps } from './state/AppData';
import { Fach } from './ui/screens/Fach';
import { Einstellungen } from './ui/screens/Einstellungen';
import { Platzhalter } from './ui/screens/Platzhalter';
import { Start } from './ui/screens/Start';

function Routen() {
  const { bereit, hatToken } = useAppData();
  if (!bereit) {
    return (
      <section className="screen" aria-busy="true">
        <p className="lead">Lädt …</p>
      </section>
    );
  }
  return (
    <Routes>
      <Route path="/" element={hatToken ? <Start /> : <Einstellungen />} />
      <Route path="/fach/:fachId" element={<Fach />} />
      <Route path="/thema/:fachId/:themaId" element={<Platzhalter titel="Thema" />} />
      <Route path="/wiederholen" element={<Platzhalter titel="Wiederholen" />} />
      <Route path="/pruefung" element={<Platzhalter titel="Prüfung" />} />
      <Route path="/suche" element={<Platzhalter titel="Suche" />} />
      <Route path="/einstellungen" element={<Einstellungen />} />
      <Route path="*" element={<Platzhalter titel="Seite nicht gefunden" />} />
    </Routes>
  );
}

/** App-Gerüst: Zustand (AppDataProvider) und alle Routen. Props nur für Tests. */
export function App(props: Omit<AppDataProviderProps, 'children'>) {
  return (
    <AppDataProvider {...props}>
      <HashRouter>
        <div className="app">
          <header className="app-bar">
            <Link to="/" className="wordmark">Lernapp</Link>
            <Link to="/einstellungen" className="app-bar__link" aria-label="Zu den Einstellungen" title="Einstellungen">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
              </svg>
            </Link>
          </header>
          <main>
            <Routen />
          </main>
        </div>
      </HashRouter>
    </AppDataProvider>
  );
}
