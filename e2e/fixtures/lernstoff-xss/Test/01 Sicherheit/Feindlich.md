---
id: test-feindlich
fach: test
kapitel: 01 Sicherheit
titel: Feindlich
quellen: []
stand: 2026-11-23
---
# Feindlich

## Zusammenfassung
Prüft, dass Mindmap-Knotentext nie als HTML oder Link ausgeführt wird.

## Mindmap
- Wurzel
  - <img src=x onerror="window.__xss=1">
  - [x](javascript:window.__xss=2)
  - Harmlos
