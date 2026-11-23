# lernapp

Lern-App für Schulstoff: Lernkarten mit Wiederholungssystem, Übungen, Mindmaps und Prüfungsmodus. Läuft als installierbare Web-App (PWA) auf PC und Handy.

Dieses Repo enthält **nur Code**. Der Lernstoff liegt in einem separaten, privaten Repo (`lernstoff`) als Markdown-Dateien. Das Format ist dort im `README.md` beschrieben.

## Stand

| Teil | Status |
|---|---|
| Format-Parser, ID-Vergabe, Index-Bau (`src/format/`, `scripts/build-index.ts`) | fertig, getestet |
| App (Start, Fach mit Ampel, Thema, Wiederholen mit FSRS, Übungen, Prüfung, Suche, „Frag Bob“, offline, Sync zwischen Geräten) | live unter https://malvonius.github.io/lernapp/ |
| Einspielen aus der App, Cloud-Routine, OneDrive-Job | folgt (Plan 3) |

## Installieren

- **PC (Edge):** https://malvonius.github.io/lernapp/ öffnen → Menü „…“ → „Apps“ → „Diese Website als App installieren“.
- **Android (Chrome):** Seite öffnen → Menü „⋮“ → „Zum Startbildschirm hinzufügen“ bzw. „App installieren“.
- Beim ersten Start: GitHub-Token eintragen (fine-grained, nur Repository `lernstoff`, Berechtigung „Contents: Read and write“) und einen Gerätenamen pro Gerät (z. B. `pc`, `handy`). Das Token bleibt nur auf dem Gerät.

## Wie es funktioniert

- Inhalte: `index.json` und Themen-Dateien werden über die GitHub-API geladen und in IndexedDB zwischengespeichert (offline nutzbar).
- Fortschritt: jede Bewertung ist ein Ereignis; jedes Gerät schreibt nur seine Datei `_fortschritt/<gerät>.json`. Der Lernstand (FSRS) wird aus den Ereignissen aller Geräte nachgerechnet, deshalb ist er überall gleich. Hochgeladen wird gebündelt (nach 1 Minute Pause, beim Wegwischen, am Sitzungsende, wenn das Netz zurückkommt).

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
