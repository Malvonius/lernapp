import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { bereiche, suche, type Treffer } from '../../lib/search';
import { useAppData } from '../../state/AppData';

const WO_LABEL: Record<Treffer['wo'], string> = { titel: 'Titel', text: 'Text', karte: 'Karte' };

/** Hebt die Fundstellen mit <mark> hervor; baut React-Knoten aus reinem Text, nie HTML. */
function Hervorgehoben({ text, q }: { text: string; q: string }): ReactNode {
  const teile: ReactNode[] = [];
  let pos = 0;
  bereiche(text, q).forEach(([a, b], i) => {
    if (a > pos) teile.push(text.slice(pos, a));
    teile.push(<mark key={i}>{text.slice(a, b)}</mark>);
    pos = b;
  });
  if (pos < text.length) teile.push(text.slice(pos));
  return teile.map((t, i) => <Fragment key={i}>{t}</Fragment>);
}

export function Suche() {
  const { index, topics } = useAppData();
  const [eingabe, setEingabe] = useState('');
  const [q, setQ] = useState('');
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => feld.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => setQ(eingabe), 150);
    return () => clearTimeout(t);
  }, [eingabe]);

  const { themen, ziele } = useMemo(() => {
    const themen: { pfad: string; topic: NonNullable<ReturnType<typeof topics>>; fachName: string }[] = [];
    const ziele = new Map<string, string>();
    for (const fach of index?.faecher ?? []) {
      for (const t of [...fach.kapitel.flatMap((k) => k.themen), ...fach.nichtZugeordnet]) {
        const topic = t.pfad ? topics(t.pfad) : null;
        if (!t.pfad || !t.id || !topic) continue;
        themen.push({ pfad: t.pfad, topic, fachName: fach.name });
        ziele.set(t.pfad, `/thema/${encodeURIComponent(fach.id)}/${encodeURIComponent(t.id)}`);
      }
    }
    return { themen, ziele };
  }, [index, topics]);

  const treffer = useMemo(() => suche(themen, q), [themen, q]);

  return (
    <section className="screen" aria-labelledby="suche-h">
      <h1 id="suche-h" className="visually-hidden">Suche</h1>
      <div className="field">
        <label htmlFor="suche-feld">Suche</label>
        <input
          ref={feld}
          id="suche-feld"
          type="search"
          className="input"
          autoComplete="off"
          placeholder="Thema, Begriff oder Karte …"
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
        />
      </div>
      {q.trim() && treffer.length === 0 && <p className="lead">Nichts gefunden.</p>}
      {treffer.length > 0 && (
        <ul className="suche-liste" aria-live="polite">
          {treffer.map((t, i) => (
            <li key={`${t.pfad}-${t.wo}-${i}`}>
              <Link to={ziele.get(t.pfad) ?? '/'} className="suche-treffer">
                <span className="suche-treffer__kopf">
                  {t.titel} <span className="suche-treffer__meta">· {t.fachName} · {WO_LABEL[t.wo]}</span>
                </span>
                {t.wo !== 'titel' && (
                  <span className="suche-treffer__text">
                    <Hervorgehoben text={t.ausschnitt} q={q} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
