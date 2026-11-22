import type { Status } from '../../lib/status';

export const STATUS_LABEL: Record<Status, string> = {
  gruen: 'sitzt',
  gelb: 'wackelt',
  rot: 'vergessen',
  neu: 'neu',
  luecke: 'Lücke',
  fehlerhaft: 'fehlerhaft',
};

/** Ampel-Punkt mit Textlabel (Farbe allein reicht nicht). */
export function Ampel({ status, label = STATUS_LABEL[status] }: { status: Status; label?: string }) {
  return (
    <span className={`ampel ampel--${status}`}>
      <span className="ampel__punkt" aria-hidden="true" />
      <span className="ampel__text">{label}</span>
    </span>
  );
}
