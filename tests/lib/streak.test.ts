import { describe, expect, it } from 'vitest';
import type { Ereignis } from '../../src/lib/progress';
import { glutSerie, wienerTag } from '../../src/lib/streak';

const karte = (zeit: string, geraet = 'handy'): Ereignis => ({ art: 'karte', ziel: 'k-1', zeit, geraet, bewertung: 3 });
const uebung = (zeit: string, geraet = 'handy'): Ereignis => ({ art: 'uebung', ziel: 'u-1', zeit, geraet, richtig: true });
const pruefung = (zeit: string): Ereignis => ({ art: 'pruefung', ziel: 'p-1', zeit, geraet: 'handy', punkte: 3, max: 4 });

// 23.11.2026 11:00 in Wien (MEZ, UTC+1)
const JETZT = new Date('2026-11-23T10:00:00.000Z');

describe('wienerTag', () => {
  it('rechnet in Europe/Vienna, nicht in UTC', () => {
    expect(wienerTag(new Date('2026-11-22T23:30:00.000Z'))).toBe('2026-11-23'); // 00:30 MEZ
    expect(wienerTag(new Date('2026-11-22T22:59:59.000Z'))).toBe('2026-11-22'); // 23:59 MEZ
    expect(wienerTag(new Date('2026-07-01T22:30:00.000Z'))).toBe('2026-07-02'); // 00:30 MESZ
    expect(wienerTag(new Date('2026-07-01T21:59:00.000Z'))).toBe('2026-07-01'); // 23:59 MESZ
  });
});

describe('glutSerie', () => {
  it('leere Liste → 0 Tage, heute nicht gelernt', () => {
    expect(glutSerie([], JETZT)).toEqual({ tage: 0, heuteGelernt: false });
  });

  it('nur heute gelernt → 1 Tag, brennt', () => {
    expect(glutSerie([karte('2026-11-23T07:00:00.000Z')], JETZT)).toEqual({ tage: 1, heuteGelernt: true });
  });

  it('drei Tage in Folge bis heute', () => {
    const ev = [karte('2026-11-21T09:00:00.000Z'), uebung('2026-11-22T18:00:00.000Z'), karte('2026-11-23T06:00:00.000Z')];
    expect(glutSerie(ev, JETZT)).toEqual({ tage: 3, heuteGelernt: true });
  });

  it('heute noch nichts: Serie zählt bis gestern weiter (glimmt)', () => {
    const ev = [karte('2026-11-21T09:00:00.000Z'), karte('2026-11-22T09:00:00.000Z')];
    expect(glutSerie(ev, JETZT)).toEqual({ tage: 2, heuteGelernt: false });
  });

  it('eine Lücke bricht die Serie', () => {
    const ev = [karte('2026-11-19T09:00:00.000Z'), karte('2026-11-20T09:00:00.000Z'), karte('2026-11-22T09:00:00.000Z'), karte('2026-11-23T09:00:00.000Z')];
    expect(glutSerie(ev, JETZT)).toEqual({ tage: 2, heuteGelernt: true });
  });

  it('zuletzt vorgestern gelernt → erloschen (0)', () => {
    expect(glutSerie([karte('2026-11-21T09:00:00.000Z')], JETZT)).toEqual({ tage: 0, heuteGelernt: false });
  });

  it('mehrere Geräte ergänzen sich zu einer Serie', () => {
    const ev = [karte('2026-11-21T09:00:00.000Z', 'pc'), uebung('2026-11-22T09:00:00.000Z', 'handy'), karte('2026-11-23T09:00:00.000Z', 'pc')];
    expect(glutSerie(ev, JETZT)).toEqual({ tage: 3, heuteGelernt: true });
  });

  it('mehrere Ereignisse am selben Tag zählen einmal, Reihenfolge egal', () => {
    const ev = [karte('2026-11-23T09:00:00.000Z'), karte('2026-11-22T20:00:00.000Z'), karte('2026-11-23T08:00:00.000Z', 'pc'), karte('2026-11-22T07:00:00.000Z')];
    expect(glutSerie(ev, JETZT)).toEqual({ tage: 2, heuteGelernt: true });
  });

  it('Prüfungs-Ereignisse zählen nicht als Lerntag', () => {
    expect(glutSerie([pruefung('2026-11-23T09:00:00.000Z')], JETZT)).toEqual({ tage: 0, heuteGelernt: false });
  });

  it('Mitternacht in Wien: 00:30 MEZ ist schon der neue Tag', () => {
    // 22.11. 23:30 UTC = 23.11. 00:30 Wien → heute
    expect(glutSerie([karte('2026-11-22T23:30:00.000Z')], JETZT)).toEqual({ tage: 1, heuteGelernt: true });
    // 22.11. 22:59 UTC = 22.11. 23:59 Wien → gestern
    expect(glutSerie([karte('2026-11-22T22:59:00.000Z')], JETZT)).toEqual({ tage: 1, heuteGelernt: false });
  });

  it('„jetzt“ kurz nach Mitternacht in Wien, aber in UTC noch der Vortag', () => {
    const kurzNach = new Date('2026-11-22T23:10:00.000Z'); // 23.11. 00:10 Wien
    const ev = [karte('2026-11-22T20:00:00.000Z'), karte('2026-11-21T20:00:00.000Z')]; // 22.11. und 21.11. abends
    expect(glutSerie(ev, kurzNach)).toEqual({ tage: 2, heuteGelernt: false });
  });

  it('über die Zeitumstellung (29.03.2026) hinweg bleibt die Serie heil', () => {
    const ev = [karte('2026-03-28T10:00:00.000Z'), karte('2026-03-29T10:00:00.000Z'), karte('2026-03-30T10:00:00.000Z')];
    expect(glutSerie(ev, new Date('2026-03-30T12:00:00.000Z'))).toEqual({ tage: 3, heuteGelernt: true });
  });

  it('Tage nach heute (Uhr eines anderen Geräts geht vor) und kaputte Zeiten werden ignoriert', () => {
    const ev = [karte('2026-11-25T09:00:00.000Z'), karte('kaputt'), karte('2026-11-23T09:00:00.000Z')];
    expect(glutSerie(ev, JETZT)).toEqual({ tage: 1, heuteGelernt: true });
  });

  it('ein Ereignis später am selben Wiener Tag zählt für heute', () => {
    expect(glutSerie([karte('2026-11-23T10:05:00.000Z', 'pc')], JETZT)).toEqual({ tage: 1, heuteGelernt: true });
  });
});
