import { afterEach, describe, expect, it, vi } from 'vitest';
import { bauePrompt, uebergeben } from '../../src/lib/askBob';

const basis = { fach: 'Mathe', thema: 'Ableitungen', zusammenfassung: 'Die Ableitung misst die Steigung.', frage: 'Warum ist (x^2)\' = 2x?' };

describe('bauePrompt', () => {
  it('enthält Fach, Thema, Lernstoff und Frage', () => {
    const p = bauePrompt(basis);
    expect(p).toContain('Ich lerne für Mathe, Thema Ableitungen.');
    expect(p).toContain('Hier ist mein Lernstoff:');
    expect(p).toContain('Die Ableitung misst die Steigung.');
    expect(p).toContain("Warum ist (x^2)' = 2x?");
    expect(p).toContain('auf Deutsch');
  });
  it('kürzt die Zusammenfassung auf 6000 Zeichen mit „…“', () => {
    const p = bauePrompt({ ...basis, zusammenfassung: 'a'.repeat(7000) });
    expect(p).toContain('a'.repeat(6000) + '…');
    expect(p).not.toContain('a'.repeat(6001));
  });
  it('lässt kurze Zusammenfassungen unverändert', () => {
    expect(bauePrompt({ ...basis, zusammenfassung: 'kurz' })).not.toContain('kurz…');
  });
  it('enthält das aktuelle Element mit Antwort und eigener Antwort', () => {
    const p = bauePrompt({ ...basis, element: { art: 'uebung', frage: 'Berechne f\'(2)', antwort: 'Lösung 4', meineAntwort: 'mein Versuch 5' } });
    expect(p).toContain('Übung');
    expect(p).toContain("Berechne f'(2)");
    expect(p).toContain('Lösung 4');
    expect(p).toContain('mein Versuch 5');
  });
  it('beschreibt eine Karte', () => {
    const p = bauePrompt({ ...basis, element: { art: 'karte', frage: 'Was ist e?', antwort: '2,718' } });
    expect(p).toContain('Lernkarte');
    expect(p).toContain('Was ist e?');
    expect(p).toContain('2,718');
  });
  it('lässt das Element ohne Angabe weg', () => {
    expect(bauePrompt(basis)).not.toContain('Lernkarte');
  });
});

describe('uebergeben', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubNav = (nav: Record<string, unknown>) => vi.stubGlobal('navigator', nav);

  const mobil = { userAgentData: { mobile: true } };

  it('teilt mit navigator.share({ text })', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn();
    stubNav({ share, ...mobil });
    vi.stubGlobal('window', { open });
    expect(await uebergeben('Hallo')).toBe('geteilt');
    expect(share).toHaveBeenCalledWith({ text: 'Hallo' });
    expect(open).not.toHaveBeenCalled();
  });
  it('Abbruch im Teilen-Menü → „abgebrochen“, sonst nichts', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'));
    const writeText = vi.fn();
    const open = vi.fn();
    stubNav({ share, clipboard: { writeText }, ...mobil });
    vi.stubGlobal('window', { open });
    expect(await uebergeben('Hallo')).toBe('abgebrochen');
    expect(writeText).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
  it('anderer Share-Fehler → Zwischenablage', async () => {
    const share = vi.fn().mockRejectedValue(new Error('kaputt'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn();
    stubNav({ share, clipboard: { writeText }, ...mobil });
    vi.stubGlobal('window', { open });
    expect(await uebergeben('Hallo')).toBe('kopiert');
    expect(writeText).toHaveBeenCalledWith('Hallo');
  });
  it('Touch-Gerät (pointer: coarse) ohne userAgentData → teilt', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn();
    const matchMedia = vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' }));
    stubNav({ share });
    vi.stubGlobal('window', { open, matchMedia });
    expect(await uebergeben('Hallo')).toBe('geteilt');
    expect(share).toHaveBeenCalledWith({ text: 'Hallo' });
  });
  it('PC (Edge mit share, feiner Zeiger): kein Teilen-Menü, sondern kopieren und claude.ai öffnen', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn();
    const matchMedia = vi.fn(() => ({ matches: false }));
    stubNav({ share, clipboard: { writeText }, userAgentData: { mobile: false } });
    vi.stubGlobal('window', { open, matchMedia });
    expect(await uebergeben('Hallo')).toBe('kopiert');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('Hallo');
    expect(open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener');
  });
  it('ohne share: kopiert und öffnet claude.ai', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const open = vi.fn();
    stubNav({ clipboard: { writeText } });
    vi.stubGlobal('window', { open });
    expect(await uebergeben('Hallo')).toBe('kopiert');
    expect(writeText).toHaveBeenCalledWith('Hallo');
    expect(open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener');
  });
  it('ohne Zwischenablage → „manuell“ (Text selbst kopieren)', async () => {
    const open = vi.fn();
    stubNav({});
    vi.stubGlobal('window', { open });
    expect(await uebergeben('Hallo')).toBe('manuell');
    expect(open).not.toHaveBeenCalled();
  });
});
