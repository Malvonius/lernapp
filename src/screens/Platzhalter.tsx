/** Platzhalter für Screens, die spätere Tasks bauen. */
export function Platzhalter({ titel }: { titel: string }) {
  return (
    <section className="screen">
      <h1>{titel}</h1>
      <p className="lead">Kommt bald.</p>
    </section>
  );
}
