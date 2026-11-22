import { Link } from 'react-router-dom';
import type { GitHubError } from '../../lib/github';
import { useAppData } from '../../state/AppData';

/** Feste deutsche Meldung zu einem GitHub-Fehler (nie Antworttexte oder Token). */
export function fehlerText(e: GitHubError, hatDaten: boolean): string {
  switch (e.kind) {
    case 'auth':
      return 'Token ungültig oder ohne Zugriff';
    case 'ratelimit':
      return 'GitHub-Limit erreicht, später nochmal versuchen';
    case 'network':
      return hatDaten ? 'Keine Verbindung zu GitHub' : 'Keine Verbindung und noch keine Daten gespeichert';
    case 'notfound':
      return 'Lernstoff-Repo nicht gefunden';
    default:
      return e.message;
  }
}

export function formatStand(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Zeigt Offline-Stand oder Sync-Fehler; ohne beides nichts. */
export function SyncBanner({ mitLink = true }: { mitLink?: boolean }) {
  const { syncStatus, index } = useAppData();
  const { fehler, offline, stand } = syncStatus;
  if (fehler) {
    const zuEinstellungen = mitLink && (fehler.kind === 'auth' || fehler.kind === 'notfound');
    return (
      <div className="banner banner--fehler" role="alert">
        <span>{fehlerText(fehler, index !== null)}</span>
        {zuEinstellungen && <Link to="/einstellungen">Einstellungen</Link>}
      </div>
    );
  }
  if (offline) {
    return (
      <div className="banner" role="status">
        offline, Stand {stand ? formatStand(stand) : 'unbekannt'}
      </div>
    );
  }
  return null;
}
