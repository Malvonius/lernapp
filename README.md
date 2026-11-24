# lernapp

Lern-App für Schulstoff: Lernkarten mit Wiederholungssystem, Übungen, Mindmaps und Prüfungsmodus. Läuft als installierbare Web-App (PWA) auf PC und Handy.

Dieses Repo enthält **nur Code**. Der Lernstoff liegt in einem separaten, privaten Repo (`lernstoff`) als Markdown-Dateien. Das Format ist dort im `README.md` beschrieben.

## Stand

| Teil | Status |
|---|---|
| Format-Parser, ID-Vergabe, Index-Bau (`src/format/`, `scripts/build-index.ts`) | fertig, getestet |
| App (Start, Fach mit Ampel, Thema, Wiederholen mit FSRS, Übungen, Prüfung, Suche, „Frag Bob“, offline, Sync zwischen Geräten) | live unter https://malvonius.github.io/lernapp/ |
| Unterlagen hochladen (nach `lernstoff/_inbox/`), Rückfragen von Bob anzeigen | live (Plan 3); Umwandlung macht Bob auf Zuruf im Chat |

## Installieren

- **PC (Edge):** https://malvonius.github.io/lernapp/ öffnen → Menü „…“ → „Apps“ → „Diese Website als App installieren“.
- **Android (Chrome):** Seite öffnen → Menü „⋮“ → „Zum Startbildschirm hinzufügen“ bzw. „App installieren“.
- Beim ersten Start: GitHub-Token eintragen (fine-grained, nur Repository `lernstoff`, Berechtigung „Contents: Read and write“) und einen Gerätenamen pro Gerät (z. B. `pc`, `handy`). Das Token bleibt nur auf dem Gerät.

## Wie es funktioniert

- Inhalte: `index.json` und Themen-Dateien werden über die GitHub-API geladen und in IndexedDB zwischengespeichert (offline nutzbar).
- Fortschritt: jede Bewertung ist ein Ereignis; jedes Gerät schreibt nur seine Datei `_fortschritt/<gerät>.json`. Der Lernstand (FSRS) wird aus den Ereignissen aller Geräte nachgerechnet, deshalb ist er überall gleich. Hochgeladen wird gebündelt (nach 1 Minute Pause, beim Wegwischen, am Sitzungsende, wenn das Netz zurückkommt).

## Probe-Schularbeiten und Statistik

- **Probe-Schularbeit:** Dateien `<Fach>/_proben/*.md` im Lernstoff (Format: Lernstoff-README). In der App unter dem Fach: Timer, kein Feedback während des Schreibens, Auswertung nach Abgabe (Selbsteinschätzung bei offenen Aufgaben), Note nur mit hinterlegtem Notenschlüssel. Ergebnis wird auch beim Schließen der App gespeichert.
- **Statistik:** Startseite → Statistik (optional pro Fach): Aktivität, Glut-Kalender, Trefferquote pro Kapitel, meist vergessene Karten, Prüfungsverlauf.

## Unterlagen hochladen

Startseite → „Unterlagen hochladen“: Dateien (PDF, Word, PowerPoint, Excel, Fotos, ZIP, Text; je max. 25 MB), Fach oder „Bob entscheidet“, optional Wunsch. Die Datei landet in `_inbox/<Zeitstempel>_<Name>` mit `.meta.json`. Danach Bob im Chat: „Verarbeite die Inbox“. Das Token braucht dafür Schreibrecht (Contents: Read and write).

## Entwicklung

```powershell
npm ci
npm test
npm run e2e
```

Deploy: Push auf `main` → GitHub Action `pages.yml` testet, baut und veröffentlicht auf GitHub Pages.

## Index bauen

```powershell
npx tsx scripts/build-index.ts <lernstoff-ordner> [--fix]
```

- schreibt `<lernstoff-ordner>/index.json` (immer, auch wenn Fehler gefunden wurden)
- `--fix` ergänzt fehlende Karten- und Übungs-IDs in den Themen-Dateien
- Exit-Code 1, wenn Fehler gefunden wurden; Datei und Zeile stehen in der Ausgabe

Die GitHub-Action im Lernstoff-Repo ruft genau dieses Skript bei jedem Push auf.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/format/types.ts` | Datentypen von Thema, Fach und Index |
| `src/format/markdown.ts` | Frontmatter und `##`-Abschnitte (CRLF/BOM-fest) |
| `src/format/parseTopic.ts` | Themen-Datei → Karten, Übungen, Mindmap |
| `src/format/parseSubject.ts` | Fach-Datei → Kapitel und Themenliste |
| `src/format/ids.ts` | stabile IDs ergänzen, Duplikate finden |
| `src/format/buildIndex.ts` | Ordner → `index.json` |
| `src/format/gitHash.ts` | Git-Blob-SHA (gleich wie die GitHub-API) |
