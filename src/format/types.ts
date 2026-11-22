export type ExerciseType = 'eingabe' | 'schritte' | 'mc' | 'offen';

export interface Card {
  id: string | null;
  frage: string;
  antwort: string;
  zurueckgezogen: boolean;
  /** 1-basierte Zeile der `**F:**`-Zeile in der Originaldatei */
  zeile: number;
  /** 1-basierte Zeile des letzten Inhalts der Karte (ohne eigene ID-Zeile) */
  ende: number;
}

export interface Exercise {
  id: string | null;
  typ: ExerciseType;
  frage: string;
  loesung?: string | number;
  toleranz?: number;
  schritte?: string[];
  optionen?: string[];
  richtig?: number[];
  musterloesung?: string;
  zurueckgezogen: boolean;
  /** 1-basierte Zeile der öffnenden ```uebung-Zeile */
  zeile: number;
  /** 1-basierte Zeile eines vorhandenen `id:`-Schlüssels (auch leer/ungültig), sonst null */
  idZeile: number | null;
}

export interface MindmapNode {
  text: string;
  kinder: MindmapNode[];
}

export interface Topic {
  id: string;
  fach: string;
  kapitel: string;
  titel: string;
  quellen: string[];
  stand: string;
  zusammenfassung: string;
  mindmap: MindmapNode | null;
  karten: Card[];
  uebungen: Exercise[];
  fehler: string[];
}

/** Eintrag aus `[[datei]]` bzw. `[[datei|titel]]` in der Fach-Datei */
export interface SubjectTopicRef {
  titel: string;
  datei: string;
}

export interface SubjectChapter {
  ordner: string;
  titel: string;
  themen: SubjectTopicRef[];
}

export type Struktur = 'fest' | 'vorlaeufig';

export interface Subject {
  id: string;
  name: string;
  kuerzel: string;
  farbe: string;
  struktur: Struktur;
  kapitel: SubjectChapter[];
  fehler: string[];
}

export interface IndexTopic {
  id: string | null;
  titel: string;
  /** null = steht in der Themenliste, aber es gibt noch keine Unterlagen */
  pfad: string | null;
  hash: string | null;
  karten: number;
  uebungen: number;
  hatMindmap: boolean;
  fehler: string[];
}

export interface IndexChapter {
  ordner: string;
  titel: string;
  themen: IndexTopic[];
}

export interface IndexSubject {
  id: string;
  name: string;
  kuerzel: string;
  farbe: string;
  struktur: Struktur;
  pfad: string;
  hash: string;
  kapitel: IndexChapter[];
  nichtZugeordnet: IndexTopic[];
  fehler: string[];
}

export interface LernIndex {
  version: 1;
  erstellt: string;
  faecher: IndexSubject[];
  rueckfragen: number;
  fehlerAnzahl: number;
}
