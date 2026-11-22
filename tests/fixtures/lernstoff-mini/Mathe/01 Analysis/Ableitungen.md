---
id: mathe-ableitungen
fach: mathe
kapitel: 01 Analysis
titel: Ableitungen
quellen:
  - "[[_quellen/Mathe/Beispiel.docx]]"
stand: 2026-11-22
---
# Ableitungen

## Zusammenfassung
Die Ableitung $f'(x)$ gibt die Steigung von $f$ an der Stelle $x$ an.

## Mindmap
- Ableitungen
  - Regeln
    - Potenzregel
    - Kettenregel
  - Anwendungen
    - Extremstellen

## Lernkarten

**F:** Was ist die Ableitung von $x^n$?
**A:** $n \cdot x^{n-1}$ ^k-a1b2c3

**F:** Wie lautet die Kettenregel?
**A:** Äußere mal innere Ableitung:

$$ (f(g(x)))' = f'(g(x)) \cdot g'(x) $$

- Beispiel: $(\sin(2x))' = 2\cos(2x)$ ^k-d4e5f6

%%zurückgezogen%%
**F:** Alte Karte?
**A:** Gilt nicht mehr. ^k-g7h8i9

## Übungen

```uebung
id: u-aaa111
typ: eingabe
frage: "Berechne f'(2) für f(x) = x^3."
loesung: 12
toleranz: 0.01
```

```uebung
id: u-bbb222
typ: schritte
frage: "Leite f(x) = (3x+1)^2 ab."
schritte:
  - "Äußere Funktion u^2, innere 3x+1"
  - "f'(x) = 2(3x+1) · 3"
  - "f'(x) = 18x + 6"
```

```uebung
id: u-ccc333
typ: mc
frage: "Welche Funktionen haben die Ableitung 2x?"
optionen: ["x^2", "x^2 + 5", "2x^2"]
richtig: [0, 1]
```

```uebung
id: u-ddd444
typ: offen
frage: "Erkläre, warum an einer Extremstelle f'(x) = 0 gilt."
musterloesung: "An einer Extremstelle ist die Tangente waagrecht, also Steigung 0."
```
