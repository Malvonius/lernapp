# lernapp

Lern-App für Schulstoff: Lernkarten mit Wiederholungssystem, Übungen, Mindmaps und Prüfungsmodus. Läuft als installierbare Web-App (PWA) auf PC und Handy.

Dieses Repo enthält **nur Code**. Der Lernstoff liegt in einem separaten, privaten Repo (`lernstoff`) als Markdown-Dateien. Das Format ist dort im `README.md` beschrieben.

## Stand

| Teil | Status |
|---|---|
| Format-Parser, ID-Vergabe, Index-Bau (`src/format/`, `scripts/build-index.ts`) | fertig, getestet |
| App-Oberfläche (Lernen, Karten, Prüfung, PWA) | folgt |

## Entwicklung

```powershell
npm ci
npm test
```

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
