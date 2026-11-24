---
id: mathe-probe-ableitungen-1
fach: mathe
titel: Probe-Schularbeit Differentialrechnung
dauer_min: 20
quellen:
  - "[[_quellen/Mathe/Beispiel.docx]]"
stand: 2026-11-23
notenschluessel:
  - { note: 1, ab_prozent: 88 }
  - { note: 2, ab_prozent: 75 }
  - { note: 3, ab_prozent: 62 }
  - { note: 4, ab_prozent: 50 }
  - { note: 5, ab_prozent: 0 }
---
# Probe-Schularbeit Differentialrechnung

## Hinweise
Erlaubt: Formelsammlung und Taschenrechner. Gib bei offenen Aufgaben den Rechenweg an.

## Aufgaben

```uebung
id: u-pr0001
typ: eingabe
frage: "Berechne $f'(1)$ für $f(x) = 3x^2 + 2x$."
loesung: 8
toleranz: 0.01
punkte: 4
```

```uebung
id: u-pr0002
typ: mc
frage: 'Welche Funktionen haben die Ableitung $\cos(x)$?'
optionen: ['$\sin(x)$', '$\sin(x) + 3$', '$-\sin(x)$']
richtig: [0, 1]
punkte: 3
```

```uebung
id: u-pr0003
typ: offen
frage: "Bestimme die Extremstellen von $f(x) = x^3 - 3x$ und begründe, ob Hoch- oder Tiefpunkt."
musterloesung: |
  $f'(x) = 3x^2 - 3 = 0$ ⇒ $x = \pm 1$.

  $f''(x) = 6x$: $f''(1) = 6 > 0$ ⇒ Tiefpunkt $(1|-2)$, $f''(-1) = -6 < 0$ ⇒ Hochpunkt $(-1|2)$.
punkte: 5
```
