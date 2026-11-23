import { useEffect, useState } from 'react';
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { AppDataProvider, useAppData, type AppDataProviderProps } from './state/AppData';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { Fach } from './ui/screens/Fach';
import { Einstellungen } from './ui/screens/Einstellungen';
import { Platzhalter } from './ui/screens/Platzhalter';
import { Pruefung } from './ui/screens/Pruefung';
import { Suche } from './ui/screens/Suche';
import { Start } from './ui/screens/Start';
import { Thema } from './ui/screens/Thema';
import { Wiederholen } from './ui/screens/Wiederholen';

function Routen() {
  const { bereit, hatToken } = useAppData();
  const { search } = useLocation();
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
      <Route path="/thema/:fachId/:themaId" element={<Thema />} />
      {/* key: andere Query (Fach/Thema) = neue Sitzung */}
      <Route path="/wiederholen" element={<Wiederholen key={search} />} />
      <Route path="/pruefung" element={<Pruefung />} />
      <Route path="/suche" element={<Suche />} />
      <Route path="/einstellungen" element={<Einstellungen />} />
      <Route path="*" element={<Platzhalter titel="Seite nicht gefunden" />} />
    </Routes>
  );
}

/** Farbe der Statusleiste je Theme (gleich --c-bg) */
const THEME_FARBE = { dunkel: '#110e10', hell: '#f1e9dc' } as const;

/**
 * Großer Titel → kleine Kopfleiste (Apple): Sobald die sichtbare h1 des Screens unter der Leiste
 * verschwindet, zeigt die Leiste ihren Text. Der Text steht nur in einem CSS-Attribut (::after),
 * damit er für Screenreader und Tests nicht doppelt vorkommt.
 */
function useKompaktTitel(): string | null {
  const { pathname, search } = useLocation();
  const [titel, setTitel] = useState<string | null>(null);
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main || typeof IntersectionObserver !== 'function') return;
    let h1: Element | null = null;
    let io: IntersectionObserver | null = null;
    const binden = () => {
      const neu = main.querySelector('h1:not(.visually-hidden)');
      if (neu === h1) return;
      io?.disconnect();
      h1 = neu;
      setTitel(null);
      if (!neu) return;
      io = new IntersectionObserver(
        ([e]) => setTitel(e && !e.isIntersecting && e.boundingClientRect.top < 0 ? (neu.textContent ?? '').trim() || null : null),
        { rootMargin: '-56px 0px 0px 0px' },
      );
      io.observe(neu);
    };
    binden();
    const mo = new MutationObserver(binden);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, [pathname, search]);
  return titel;
}

function KopfLeiste() {
  const { theme } = useAppData();
  const titel = useKompaktTitel();
  const [gescrollt, setGescrollt] = useState(false);

  useEffect(() => {
    const pruefen = () => setGescrollt(window.scrollY > 4);
    pruefen();
    window.addEventListener('scroll', pruefen, { passive: true });
    return () => window.removeEventListener('scroll', pruefen);
  }, []);

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_FARBE[theme]);
  }, [theme]);

  return (
    <header className="app-bar" data-gescrollt={gescrollt || titel !== null}>
      <Link to="/" className="wordmark">Lernapp</Link>
      <span className="app-bar__titel" aria-hidden="true" data-titel={titel ?? ''} data-sichtbar={titel !== null} />
      <div className="app-bar__aktionen">
        <Link to="/suche" className="app-bar__link" aria-label="Zur Suche" title="Suche">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.2" />
            <path d="M15.2 15.2L20.5 20.5" />
          </svg>
        </Link>
        <Link to="/einstellungen" className="app-bar__link" aria-label="Zu den Einstellungen" title="Einstellungen">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
          </svg>
        </Link>
      </div>
    </header>
  );
}

/** App-Gerüst: Zustand (AppDataProvider) und alle Routen. Props nur für Tests. */
export function App(props: Omit<AppDataProviderProps, 'children'>) {
  return (
    <ErrorBoundary>
      <AppDataProvider {...props}>
        <HashRouter>
          <div className="app">
            <KopfLeiste />
            <main>
              <Routen />
            </main>
          </div>
        </HashRouter>
      </AppDataProvider>
    </ErrorBoundary>
  );
}
