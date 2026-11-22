# Troubleshooting

## Die Index-Action im Lernstoff-Repo ist rot
1. Lauf öffnen (`gh run list -R Malvonius/lernstoff`, dann `gh run view <id> --log-failed`).
2. Im Schritt „Index bauen“ stehen Zeilen wie `FEHLER <pfad>: Karte Zeile 42: Antwort fehlt`.
3. Datei an der Zeile reparieren (Format siehe `README.md` im Lernstoff-Repo) und pushen. `index.json` wurde trotzdem gebaut, alle anderen Themen funktionieren weiter.

Häufige Fehler:
- **Antwort fehlt:** Karte ohne `**A:**`-Zeile.
- **YAML ungültig:** Im ```` ```uebung ````-Block fehlt eine Klammer oder ein Anführungszeichen. Texte mit `:` in Anführungszeichen setzen.
- **ID doppelt:** Eine Karte wurde kopiert, samt `^k-…`. Bei der Kopie die ID löschen, die Action vergibt eine neue. Die ID des Originals nie ändern, an ihr hängt der Lernfortschritt.
- **Pflichtfeld fehlt:** Frontmatter unvollständig (`id`, `fach`, `kapitel`, `titel`, `quellen`, `stand`).

## Push von `.github/workflows/…` wird abgelehnt
Der `gh`-Login braucht den Scope `workflow`: `gh auth refresh -h github.com -s workflow`.

## Konflikt in `index.json` beim Pull
`index.json` gehört nur der Action. Lokal nie committen: `git checkout -- index.json`. Bei einem Rebase-Konflikt die Version von `origin` nehmen.

## Eine `.doc`-Datei wird nicht umgewandelt
Das Extraktions-Werkzeug braucht für das alte Word-Format LibreOffice (`soffice`, auf dem PC unter `C:\Program Files\LibreOffice`). Fehlt es, etwa in einer neuen Umgebung, die Datei in Word als `.docx` speichern und erneut einspielen. Tabellen aus `.doc` zeigt pandoc manchmal nur als `[TABLE]`; dann direkt mit `soffice --headless --convert-to "txt:Text (encoded):UTF8"` den Text holen.

## Formeln fehlen nach dem Umwandeln
`.docx` und `.odt` laufen über pandoc, das Formeln als LaTeX behält. Wenn trotzdem welche fehlen, sind es meist Bilder von Formeln: Die liegen in `<datei>_bilder/` und müssen angesehen werden.
