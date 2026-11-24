import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { IndexSubject, LernIndex, Probe } from '../../format/types';
import type { Ereignis } from '../../lib/progress';
import { formatProzent, formatPunkte } from '../../lib/probe';
import {
  achse,
  aktivitaetProTag,
  fachFilter,
  glutKalender,
  meistVergessen,
  pruefungsVerlauf,
  trefferquote,
  type KalenderTag,
  type PruefungsEintrag,
  type Quote,
  type StatThema,
  type TagesAktivitaet,
} from '../../lib/stats';
import { glutSerie } from '../../lib/streak';
import { useAppData } from '../../state/AppData';
import { Markdown } from '../components/Markdown';
import { SyncBanner } from '../components/SyncBanner';

const TAGE = 14;
const WOCHEN = 12;
const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** „24.11.“ aus „2026-11-24“ */
const kurzDatum = (tag: string) => `${Number(tag.slice(8, 10))}.${Number(tag.slice(5, 7))}.`;
const wochentag = (tag: string) => WOCHENTAGE[(new Date(`${tag}T12:00:00Z`).getUTCDay() + 6) % 7]!;
const datumZeit = (iso: string) => new Date(iso).toLocaleDateString('de-AT', { timeZone: 'Europe/Vienna', day: 'numeric', month: 'short' });
const prozent = (q: Quote) => (q.gesamt === 0 ? null : Math.round((q.treffer / q.gesamt) * 100));

/** Breite eines Elements (für SVG-Koordinaten in echten Pixeln, damit Text nicht mitskaliert). */
function useBreite<T extends HTMLElement>(start: number) {
  const ref = useRef<T>(null);
  const [breite, setBreite] = useState(start);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w > 0) setBreite(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, breite] as const;
}

/** Säule mit 4 px runder Kappe oben, eckig an der Grundlinie */
function saeule(x: number, y: number, b: number, h: number): string {
  const r = Math.min(4, b / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + b - r}Q${x + b},${y} ${x + b},${y + r}V${y + h}Z`;
}

function Aktivitaet({ tage }: { tage: TagesAktivitaet[] }) {
  const [ref, breite] = useBreite<HTMLDivElement>(340);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const werte = tage.map((t) => t.karten + t.uebungen);
  const max = Math.max(0, ...werte);
  const { oben, schritt } = achse(max);
  const links = 28;
  const hoehe = 150;
  const unten = 26;
  const plotH = hoehe - unten - 12;
  const band = (breite - links) / tage.length;
  const b = Math.min(24, band * 0.62);
  const y = (v: number) => 12 + plotH - (v / oben) * plotH;
  const ticks = Array.from({ length: Math.floor(oben / schritt) + 1 }, (_, i) => i * schritt);
  const maxIdx = max > 0 ? werte.lastIndexOf(max) : -1;
  const heute = werte[werte.length - 1] ?? 0;
  const label = `Bewertungen pro Tag, letzte ${TAGE} Tage: heute ${heute}, höchstens ${max} an einem Tag, zusammen ${werte.reduce((a, c) => a + c, 0)}`;
  // Ablesezeile: zeigt den berührten Tag, sonst heute (kein schwebendes Fenster, kein Layoutsprung)
  const tip = tage[aktiv ?? tage.length - 1];

  return (
    <div className="diagramm" ref={ref}>
      {tip && (
        <p className="diagramm__ablesung" aria-hidden="true">
          <strong>{tip.karten + tip.uebungen}</strong> {aktiv === null || aktiv === tage.length - 1 ? 'heute' : `am ${wochentag(tip.tag)} ${kurzDatum(tip.tag)}`}
          <span>
            {tip.karten} Karten · {tip.uebungen} Übungen
          </span>
        </p>
      )}
      <svg className="diagramm__svg" width={breite} height={hoehe} viewBox={`0 0 ${breite} ${hoehe}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="diagramm__gitter" x1={links} x2={breite} y1={y(t)} y2={y(t)} />
            <text className="diagramm__achse" x={links - 6} y={y(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {tage.map((t, i) => {
          const v = werte[i]!;
          const x = links + i * band + (band - b) / 2;
          const zeigeDatum = i === tage.length - 1 || (tage.length - 1 - i) % (band < 30 ? 3 : 2) === 0;
          return (
            <g
              key={t.tag}
              className="diagramm__mark"
              data-aktiv={aktiv === i}
              onPointerEnter={() => setAktiv(i)}
              onPointerLeave={() => setAktiv((a) => (a === i ? null : a))}
            >
              <rect className="diagramm__treffer" x={links + i * band} y={0} width={band} height={hoehe} />
              {v > 0 && <path className="diagramm__saeule" d={saeule(x, y(v), b, y(0) - y(v))} />}
              {i === maxIdx && (
                <text className="diagramm__wert" x={x + b / 2} y={y(v) - 5} textAnchor="middle">
                  {v}
                </text>
              )}
              {zeigeDatum && (
                <text className="diagramm__achse" x={x + b / 2} y={hoehe - 8} textAnchor="middle">
                  {i === tage.length - 1 ? 'heute' : kurzDatum(t.tag)}
                </text>
              )}
            </g>
          );
        })}
        <line className="diagramm__basis" x1={links} x2={breite} y1={y(0)} y2={y(0)} />
      </svg>
      <details className="diagramm__tabelle">
        <summary>Als Tabelle</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Tag</th>
              <th scope="col">Karten</th>
              <th scope="col">Übungen</th>
              <th scope="col">Zusammen</th>
            </tr>
          </thead>
          <tbody>
            {tage.map((t) => (
              <tr key={t.tag}>
                <td>
                  {wochentag(t.tag)} {kurzDatum(t.tag)}
                </td>
                <td>{t.karten}</td>
                <td>{t.uebungen}</td>
                <td>{t.karten + t.uebungen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** 0 = nichts, 1–5 Glut-Stufen */
const stufe = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 10 ? 3 : n <= 20 ? 4 : 5);
const STUFEN_TEXT = ['0', '1–2', '3–5', '6–10', '11–20', 'mehr als 20'];

function Kalender({ wochen }: { wochen: KalenderTag[][] }) {
  const [ref, breite] = useBreite<HTMLDivElement>(340);
  const [aktiv, setAktiv] = useState<string | null>(null);
  const links = 24;
  const oben = 16;
  const luecke = 3;
  const zelle = Math.min(22, Math.floor((breite - links) / wochen.length) - luecke);
  const hoehe = oben + 7 * (zelle + luecke);
  const gelernt = wochen.flat().filter((d) => d.anzahl > 0);
  const heute = wochen.flat().filter((d) => !d.zukunft).pop();
  const tip = wochen.flat().find((d) => d.tag === aktiv) ?? heute;
  const label = `Lerntage der letzten ${WOCHEN} Wochen: an ${gelernt.length} Tagen gelernt`;
  // Monatsnamen über der ersten Woche eines Monats, nur wenn Platz bis zum vorigen ist (bei 360 px sonst Überlappung)
  const monate: { tag: string; wi: number; text: string }[] = [];
  wochen.forEach((w, wi) => {
    const tag = w[0]!.tag;
    if (wi > 0 && tag.slice(5, 7) === wochen[wi - 1]![0]!.tag.slice(5, 7)) return;
    const vorher = monate[monate.length - 1];
    if (vorher && (wi - vorher.wi) * (zelle + luecke) < 30) return;
    monate.push({ tag, wi, text: new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-AT', { month: 'short', timeZone: 'UTC' }) });
  });

  return (
    <div className="diagramm" ref={ref}>
      {tip && (
        <p className="diagramm__ablesung" aria-hidden="true">
          <strong>{tip.anzahl}</strong> {tip === heute ? 'heute' : `am ${wochentag(tip.tag)} ${kurzDatum(tip.tag)}`}
          <span>{gelernt.length} Lerntage in {WOCHEN} Wochen</span>
        </p>
      )}
      <svg className="diagramm__svg" width={breite} height={hoehe} viewBox={`0 0 ${breite} ${hoehe}`} role="img" aria-label={label}>
        {[0, 2, 4, 6].map((d) => (
          <text key={d} className="diagramm__achse" x={0} y={oben + d * (zelle + luecke) + zelle / 2} dy="0.32em">
            {WOCHENTAGE[d]}
          </text>
        ))}
        {monate.map((m) => (
          <text key={m.tag} className="diagramm__achse" x={links + m.wi * (zelle + luecke)} y={10}>
            {m.text}
          </text>
        ))}
        {wochen.map((w, wi) => (
          <g key={w[0]!.tag}>
            {w.map((d, di) =>
              d.zukunft ? null : (
                <rect
                  key={d.tag}
                  className="kalender__zelle"
                  data-stufe={stufe(d.anzahl)}
                  data-aktiv={aktiv === d.tag}
                  x={links + wi * (zelle + luecke)}
                  y={oben + di * (zelle + luecke)}
                  width={zelle}
                  height={zelle}
                  rx={3}
                  onPointerEnter={() => setAktiv(d.tag)}
                  onPointerLeave={() => setAktiv((a) => (a === d.tag ? null : a))}
                />
              ),
            )}
          </g>
        ))}
      </svg>
      <div className="kalender__legende" aria-hidden="true">
        <span>weniger</span>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="kalender__muster" data-stufe={s} title={STUFEN_TEXT[s]} />
        ))}
        <span>mehr</span>
      </div>
      <details className="diagramm__tabelle">
        <summary>Als Tabelle</summary>
        {gelernt.length === 0 ? (
          <p>Noch kein Lerntag in diesem Zeitraum.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Bewertungen</th>
              </tr>
            </thead>
            <tbody>
              {gelernt.map((d) => (
                <tr key={d.tag}>
                  <td>
                    {wochentag(d.tag)} {kurzDatum(d.tag)}
                  </td>
                  <td>{d.anzahl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}

function Meter({ name, q }: { name: string; q: Quote }) {
  const p = prozent(q);
  return (
    <div className="meter">
      <span className="meter__name">
        {name}
        {p === null ? '' : ` ${p} %`}
      </span>
      <span className="meter__spur" aria-hidden="true">
        {p !== null && p > 0 && <span style={{ width: `${p}%` }} />}
      </span>
      <span className="meter__zahl">{q.gesamt === 0 ? 'noch nichts' : `${q.treffer} von ${q.gesamt}`}</span>
    </div>
  );
}

/** Lesbarer Name einer Prüfung bzw. Probe */
function pruefungsName(e: PruefungsEintrag, index: LernIndex): string {
  if (e.art === 'probe') {
    const id = e.ziel.slice('probe:'.length);
    for (const f of index.faecher) {
      const p = (f.proben ?? []).find((x) => x.id === id);
      if (p) return p.titel;
    }
    return 'Probe-Schularbeit';
  }
  const [fachId = '', ordner = ''] = e.ziel.split(/:(.*)/s);
  const fach = index.faecher.find((f) => f.id === fachId);
  if (!fach) return 'Prüfung';
  const titel = ordner
    .split(',')
    .map((o) => fach.kapitel.find((k) => k.ordner === o)?.titel ?? o)
    .filter(Boolean);
  return `Prüfung ${fach.name}${titel.length ? `: ${titel.join(', ')}` : ''}`;
}

function Verlauf({ eintraege }: { eintraege: PruefungsEintrag[] }) {
  const [ref, breite] = useBreite<HTMLDivElement>(340);
  const links = 36;
  const rechts = 10;
  const hoehe = 130;
  const plotH = hoehe - 24;
  const x = (i: number) => (eintraege.length === 1 ? (links + breite - rechts) / 2 : links + (i / (eintraege.length - 1)) * (breite - links - rechts));
  const y = (p: number) => 8 + plotH - (p / 100) * plotH;
  const letzte = eintraege[eintraege.length - 1]!;
  const label = `Ergebnisse in Prozent, ${eintraege.length} Versuche, zuletzt ${formatProzent(letzte.prozent)}`;
  return (
    <div className="diagramm" ref={ref}>
      <svg className="diagramm__svg" width={breite} height={hoehe} viewBox={`0 0 ${breite} ${hoehe}`} role="img" aria-label={label}>
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'diagramm__basis' : 'diagramm__gitter'} x1={links} x2={breite - rechts} y1={y(t)} y2={y(t)} />
            <text className="diagramm__achse" x={links - 6} y={y(t)} dy="0.32em" textAnchor="end">
              {t} %
            </text>
          </g>
        ))}
        <polyline className="diagramm__linie" points={eintraege.map((e, i) => `${x(i)},${y(e.prozent)}`).join(' ')} />
        {eintraege.map((e, i) => (
          <circle key={`${e.zeit}-${e.ziel}`} className="diagramm__punkt" cx={x(i)} cy={y(e.prozent)} r={4.5}>
            <title>{`${datumZeit(e.zeit)}: ${formatProzent(e.prozent)}`}</title>
          </circle>
        ))}
        <text className="diagramm__wert" x={x(eintraege.length - 1)} y={y(letzte.prozent) - 10} textAnchor={eintraege.length === 1 ? 'middle' : 'end'}>
          {formatProzent(letzte.prozent)}
        </text>
      </svg>
    </div>
  );
}

/** IDs und Ziele, die zu einem Fach gehören (für den Fach-Filter). */
function filterFuer(fach: IndexSubject, themen: StatThema[], proben: (pfad: string) => Probe | null) {
  const ids = new Set<string>();
  for (const t of themen) for (const x of [...t.topic.karten, ...t.topic.uebungen]) if (x.id) ids.add(x.id);
  const probeZiele = new Set<string>();
  for (const p of fach.proben ?? []) {
    if (p.id) probeZiele.add(`probe:${p.id}`);
    for (const a of proben(p.pfad)?.aufgaben ?? []) if (a.id) ids.add(a.id);
  }
  return fachFilter(fach.id, ids, probeZiele);
}

export function Statistik() {
  const { index, topics, proben, ereignisse, jetzt } = useAppData();
  const [params, setParams] = useSearchParams();
  const fachId = params.get('fach');
  const fach = index?.faecher.find((f) => f.id === fachId) ?? null;

  const themen = useMemo<StatThema[]>(() => {
    const out: StatThema[] = [];
    for (const f of index?.faecher ?? []) {
      if (fach && f.id !== fach.id) continue;
      for (const k of f.kapitel) for (const t of k.themen) {
        const topic = t.pfad ? topics(t.pfad) : null;
        if (topic) out.push({ fachId: f.id, fachName: f.name, kapitel: k.titel, topic });
      }
      for (const t of f.nichtZugeordnet) {
        const topic = t.pfad ? topics(t.pfad) : null;
        if (topic) out.push({ fachId: f.id, fachName: f.name, kapitel: 'Nicht zugeordnet', topic });
      }
    }
    return out;
  }, [index, topics, fach]);

  const ev = useMemo(() => (fach ? ereignisse.filter(filterFuer(fach, themen, proben)) : ereignisse), [ereignisse, fach, themen, proben]);
  const tage = useMemo(() => aktivitaetProTag(ev, TAGE, jetzt), [ev, jetzt]);
  const kalender = useMemo(() => glutKalender(ev, WOCHEN, jetzt), [ev, jetzt]);
  const quoten = useMemo(() => trefferquote(ev, themen), [ev, themen]);
  const vergessen = useMemo(() => meistVergessen(ev, themen), [ev, themen]);
  const verlauf = useMemo(() => pruefungsVerlauf(ev), [ev]);
  const serie = glutSerie(ev, jetzt);
  const bewertungen = tage.reduce((s, t) => s + t.karten + t.uebungen, 0);
  const karten = quoten.reduce((q, f) => ({ treffer: q.treffer + f.karten.treffer, gesamt: q.gesamt + f.karten.gesamt }), { treffer: 0, gesamt: 0 });
  const leer = ev.length === 0;

  if (!index) {
    return (
      <section className="screen">
        <h1>Statistik</h1>
        <p className="lead">Lernstoff wird geladen …</p>
      </section>
    );
  }

  const kartenQuote = prozent(karten);
  return (
    <section className={fach ? 'screen screen--fach statistik' : 'screen statistik'} style={fach ? ({ '--fach': fach.farbe } as CSSProperties) : undefined}>
      <SyncBanner />
      <h1 className="fach-titel">Statistik</h1>
      <div className="statistik__filter field">
        <label htmlFor="statistik-fach">Fach</label>
        <select id="statistik-fach" value={fach?.id ?? ''} onChange={(e) => setParams(e.target.value ? { fach: e.target.value } : {}, { replace: true })}>
          <option value="">Alle Fächer</option>
          {index.faecher.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <ul className="kennzahlen" aria-label="Kennzahlen">
        <li>
          <span className="kennzahl__wert">{serie.tage}</span>
          <span className="kennzahl__name">Lerntage in Folge</span>
        </li>
        <li>
          <span className="kennzahl__wert">{bewertungen}</span>
          <span className="kennzahl__name">Bewertungen in 14 Tagen</span>
        </li>
        <li>
          <span className="kennzahl__wert">{kartenQuote === null ? '–' : `${kartenQuote} %`}</span>
          <span className="kennzahl__name">Karten gewusst</span>
        </li>
      </ul>

      {leer ? (
        <div className="statistik__leer">
          <p>Noch keine Lerndaten{fach ? ` in ${fach.name}` : ''}. Sobald du Karten wiederholst oder Übungen rechnest, füllt sich die Statistik.</p>
          <Link to="/wiederholen" className="button">
            Jetzt wiederholen
          </Link>
        </div>
      ) : (
        <>
          <section className="statistik__abschnitt" aria-labelledby="st-aktiv">
            <h2 id="st-aktiv" className="abschnitt-titel">Aktivität</h2>
            <p className="statistik__unter">Bewertete Karten und Übungen pro Tag, alle Geräte</p>
            <Aktivitaet tage={tage} />
          </section>

          <section className="statistik__abschnitt" aria-labelledby="st-kalender">
            <h2 id="st-kalender" className="abschnitt-titel">Glut-Kalender</h2>
            <p className="statistik__unter">Jedes Feld ein Tag; je heller, desto mehr gelernt</p>
            <Kalender wochen={kalender} />
          </section>

          <section className="statistik__abschnitt" aria-labelledby="st-quote">
            <h2 id="st-quote" className="abschnitt-titel">Trefferquote</h2>
            <p className="statistik__unter">Karten: nicht „Nochmal“ · Übungen: richtig gelöst</p>
            {quoten.filter((f) => f.kapitel.length > 0).length === 0 && <p className="lead">Noch keine Themen mit Unterlagen.</p>}
            {quoten.filter((f) => f.kapitel.length > 0).map((f) => (
              <div key={f.fachId} className="quote-fach">
                {!fach && <h3 className="quote-fach__name">{f.fachName}</h3>}
                <ul className="quote-liste">
                  {f.kapitel.map((k) => (
                    <li key={k.kapitel}>
                      <span className="quote-liste__kapitel">{k.kapitel}</span>
                      <Meter name="Karten" q={k.karten} />
                      <Meter name="Übungen" q={k.uebungen} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="statistik__abschnitt" aria-labelledby="st-vergessen">
            <h2 id="st-vergessen" className="abschnitt-titel">Meist vergessen</h2>
            {vergessen.length === 0 ? (
              <p className="lead">Noch keine Karte mit „Nochmal“ bewertet.</p>
            ) : (
              <ol className="vergessen-liste">
                {vergessen.map((v) => (
                  <li key={v.id}>
                    <div className="vergessen-liste__frage">
                      <Markdown text={v.frage} />
                    </div>
                    <p className="vergessen-liste__meta">
                      {v.nochmal}× Nochmal · {v.themaTitel}
                    </p>
                    <Link to={`/wiederholen?thema=${encodeURIComponent(v.themaId)}`} className="button button--quiet vergessen-liste__link">
                      Wiederholen
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="statistik__abschnitt" aria-labelledby="st-verlauf">
            <h2 id="st-verlauf" className="abschnitt-titel">Prüfungen und Proben</h2>
            {verlauf.length === 0 ? (
              <p className="lead">Noch keine Prüfung oder Probe-Schularbeit geschrieben.</p>
            ) : (
              <>
                {verlauf.length >= 2 && <Verlauf eintraege={verlauf} />}
                <ul className="verlauf-liste">
                  {[...verlauf].reverse().map((e) => (
                    <li key={`${e.zeit}-${e.ziel}`}>
                      <span className="verlauf-liste__name">{pruefungsName(e, index)}</span>
                      <span className="verlauf-liste__datum">{datumZeit(e.zeit)}</span>
                      <span className="verlauf-liste__wert">
                        {formatPunkte(e.punkte)} von {formatPunkte(e.max)} · {formatProzent(e.prozent)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
