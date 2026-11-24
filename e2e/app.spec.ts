import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { FakeGitHub, FORTSCHRITT, ladeFixture, TEST_TOKEN, XSS_ROOT } from './fakeGithub';

/**
 * Ende-zu-Ende im Handy-Format (390×844) gegen den Produktions-Build.
 * GitHub ist komplett gemockt (Inhalt nur aus tests/fixtures/lernstoff-mini).
 */

async function keinHorizontalesScrollen(page: Page) {
  const m = await page.evaluate(() => {
    const s = document.scrollingElement!;
    return { scrollWidth: s.scrollWidth, clientWidth: s.clientWidth };
  });
  expect(m.scrollWidth, `scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`).toBeLessThanOrEqual(m.clientWidth);
}

const handyPuts = (gh: FakeGitHub) => gh.puts.filter((p) => p.pfad === FORTSCHRITT);

/** Konsolen- und Seitenfehler sammeln (gewollte HTTP-Fehler des Mocks ausgenommen). */
function sammleFehler(page: Page): string[] {
  const fehler: string[] = [];
  page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    // Vom Mock gewollte HTTP-Antworten (z. B. 404 für noch fehlendes handy.json) meldet Chrome als Netzwerkfehler
    if (m.location().url.startsWith('https://api.github.com/')) return;
    fehler.push(`console: ${m.text()} @ ${m.location().url}`);
  });
  return fehler;
}

/** Simuliert „App in den Hintergrund“ (visibilitychange → hidden) und danach wieder sichtbar ohne Ereignis. */
async function kurzImHintergrund(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  });
}

async function einrichten(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Einrichten' })).toBeVisible();
  await page.getByLabel('GitHub-Token').fill(TEST_TOKEN);
  await expect(page.getByLabel('Gerätename')).toHaveValue('handy');
  await page.getByRole('button', { name: 'Verbindung prüfen' }).click();
}

test('Einrichten, Lernen, offline starten und Offline-Bewertung nachreichen', async ({ page, context }) => {
  const gh = new FakeGitHub(await ladeFixture());
  await context.route('https://api.github.com/**', (route) => gh.handle(route));

  const fehler = sammleFehler(page);

  // 1. Einrichten
  await einrichten(page);

  // 2. Start
  const fachKachel = page.getByRole('link', { name: /Angewandte Mathematik/ });
  await expect(fachKachel).toBeVisible();
  await expect(page.getByRole('link', { name: /Jetzt wiederholen/ })).toBeVisible();
  await keinHorizontalesScrollen(page);

  // Service Worker muss die App-Hülle fertig vorgeladen haben, bevor es offline geht.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  // 3. Fach
  await fachKachel.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Angewandte Mathematik' })).toBeVisible();
  await keinHorizontalesScrollen(page);

  // 4. Thema
  await page.getByRole('link', { name: /Ableitungen/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ableitungen' })).toBeVisible();
  await keinHorizontalesScrollen(page);

  // 5. Karte wiederholen: hochgeladen wird gebündelt, spätestens beim Verlassen der Sitzung
  await page.getByRole('link', { name: 'Dieses Thema wiederholen' }).click();
  await page.getByRole('button', { name: 'Antwort zeigen' }).click();
  await page.getByRole('button', { name: /^Gut/ }).click();
  await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toBeVisible();
  expect(handyPuts(gh)).toHaveLength(0);
  await page.goBack();
  await expect.poll(() => handyPuts(gh).length).toBe(1);
  expect(handyPuts(gh)[0]!.inhalt.ereignisse).toEqual([
    expect.objectContaining({ art: 'karte', ziel: 'k-a1b2c3', bewertung: 3, geraet: 'handy' }),
  ]);

  // 6. Übung lösen: App in den Hintergrund → sofort hochgeladen
  await expect(page.getByRole('heading', { level: 1, name: 'Ableitungen' })).toBeVisible();
  await page.getByRole('tab', { name: 'Übungen' }).click();
  await page.getByRole('textbox', { name: 'Deine Antwort' }).fill('12');
  await page.getByRole('button', { name: 'Prüfen' }).first().click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  expect(handyPuts(gh)).toHaveLength(1);
  await kurzImHintergrund(page);
  await expect.poll(() => handyPuts(gh).length).toBe(2);
  expect(handyPuts(gh)[1]!.inhalt.ereignisse).toContainEqual(expect.objectContaining({ art: 'uebung', ziel: 'u-aaa111', richtig: true }));

  // 7. Offline neu laden: Start aus dem Cache mit Banner „offline“
  gh.offline = true;
  await context.setOffline(true);
  await page.goto('./#/');
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: /^offline, Stand / })).toBeVisible();
  await expect(page.getByRole('link', { name: /Angewandte Mathematik/ })).toBeVisible();

  // 8. Offline bewerten: nichts wird hochgeladen
  const vorOffline = new Date().toISOString();
  await page.getByRole('link', { name: /Jetzt wiederholen/ }).click();
  await page.getByRole('button', { name: 'Antwort zeigen' }).click();
  await page.getByRole('button', { name: /^Gut/ }).click();
  await expect(page.getByText(/Noch \d+ von \d+|Fertig/)).toBeVisible();
  // Sitzung verlassen → Upload-Versuch, der offline scheitern muss, bevor es wieder online geht.
  await page.getByRole('link', { name: 'Zu den Einstellungen' }).click();
  await expect.poll(() => gh.abgewiesen).toContain('GET /repos/Malvonius/lernstoff/contents/_fortschritt');
  expect(handyPuts(gh)).toHaveLength(2);

  // 9. Wieder online (online-Event startet den Abgleich) + Sync → die Offline-Bewertung landet im PUT
  gh.offline = false;
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
  await expect.poll(() => handyPuts(gh).length).toBe(3);
  const letzte = handyPuts(gh)[2]!.inhalt.ereignisse;
  expect(letzte.filter((e) => e.art === 'karte' && e.zeit >= vorOffline)).toHaveLength(1);
  expect(letzte).toHaveLength(3);
  await expect(page.getByText(/^offline/)).toHaveCount(0);

  expect(fehler).toEqual([]);
});

test('Mindmap mit feindlichem Knotentext: kein HTML, kein javascript:-Link, Seite bleibt scrollbar', async ({ page, context }) => {
  const gh = new FakeGitHub(await ladeFixture(XSS_ROOT));
  await context.route('https://api.github.com/**', (route) => gh.handle(route));
  const fehler = sammleFehler(page);

  await einrichten(page);
  await page.getByRole('link', { name: /Sicherheitstest/ }).click();
  await page.getByRole('link', { name: /Feindlich/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Feindlich' })).toBeVisible();
  await page.getByRole('tab', { name: 'Mindmap' }).click();

  const bild = page.getByRole('img', { name: 'Mindmap: Wurzel' });
  await expect(bild).toBeVisible();
  // markmap hat gerendert: der feindliche Text steht als reiner Text im SVG
  await expect(bild).toContainText('<img src=x onerror=');
  await expect(bild).toContainText('Harmlos');
  expect(await bild.locator('img').count()).toBe(0);
  expect(await bild.locator('a[href^="javascript" i]').count()).toBe(0);
  expect(await page.locator('script:not([src])').evaluateAll((s) => s.filter((e) => e.textContent?.includes('__xss')).length)).toBe(0);
  // auf jeden Knoten tippen (klappt Äste, darf nichts ausführen)
  for (const knoten of await bild.locator('foreignObject').all()) await knoten.click({ force: true });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)).toBeUndefined();

  // Gesten erst nach „Zoomen und verschieben“ (vorher Seite per Wischen scrollbar)
  const touchAction = () => bild.evaluate((e) => getComputedStyle(e).touchAction);
  expect(await touchAction()).toBe('pan-y');
  await page.getByRole('button', { name: 'Zoomen und verschieben' }).click();
  expect(await touchAction()).toBe('none');

  expect(fehler).toEqual([]);
});

test('Unterlagen hochladen: Datei und Hinweis landen in _inbox, Rückfrage von Bob ist lesbar', async ({ page, context }) => {
  const dateien = await ladeFixture();
  const idx = JSON.parse(dateien.get('index.json')!);
  idx.rueckfragen = 1;
  dateien.set('index.json', JSON.stringify(idx));
  const gh = new FakeGitHub(dateien);
  gh.rueckfragen.set('2026-11-23-skript.md', '# Rückfrage: Skript\n- **Unklar:** Welches Kapitel?\n\n<img src=x onerror="window.__xss = 1">');
  await context.route('https://api.github.com/**', (route) => gh.handle(route));
  const fehler = sammleFehler(page);

  await einrichten(page);
  // Hinweis auf der Startseite führt direkt zum Abschnitt „Rückfragen von Bob“
  await page.getByRole('link', { name: '1 Rückfrage von Bob' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hochladen' })).toBeVisible();
  expect(page.url()).toContain('#/hochladen#rueckfragen');
  await expect(page.getByRole('heading', { name: 'Rückfragen von Bob' })).toBeInViewport();
  await expect(page.getByText('2026-11-23-skript.md')).toBeVisible();
  await page.getByRole('link', { name: 'Lernapp' }).click();
  await page.getByRole('link', { name: 'Unterlagen hochladen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hochladen' })).toBeVisible();

  await page.getByLabel('Dateien auswählen').setInputFiles({ name: 'Übung 1.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0, 255, 137, 80]) });
  await page.getByLabel('Fach').selectOption('mathe');
  await page.getByLabel('Wunsch (optional)').fill('mehr Übungen');
  await keinHorizontalesScrollen(page);
  await page.getByRole('button', { name: 'Hochladen' }).click();
  await expect(page.getByText('fertig', { exact: true })).toBeVisible();

  const pfade = [...gh.inbox.keys()];
  const datei = pfade.find((p) => p.endsWith('_Übung 1.pdf'));
  expect(datei).toMatch(/^_inbox\/\d{8}-\d{6}_Übung 1\.pdf$/);
  expect([...gh.inbox.get(datei!)!]).toEqual([0, 255, 137, 80]);
  const meta = JSON.parse(gh.inbox.get(`${datei}.meta.json`)!.toString('utf8'));
  expect(meta).toMatchObject({ fach: 'mathe', wunsch: 'mehr Übungen', geraet: 'handy' });
  await expect(page.getByRole('heading', { name: 'Wartet auf Bob' })).toBeVisible();
  await expect(page.getByText(/Verarbeite die Inbox/)).toBeVisible();

  // Rückfrage aufklappen: Markdown, kein rohes HTML
  await page.getByText('2026-11-23-skript.md').click();
  await expect(page.getByRole('heading', { name: 'Rückfrage: Skript' })).toBeVisible();
  expect(await page.locator('.rueckfrage img').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)).toBeUndefined();
  await keinHorizontalesScrollen(page);

  expect(fehler).toEqual([]);
});

test('Probe-Schularbeit: starten, eine Aufgabe, abgeben, Ergebnis; Statistik öffnet ohne Fehler', async ({ page, context }) => {
  const gh = new FakeGitHub(await ladeFixture());
  await context.route('https://api.github.com/**', (route) => gh.handle(route));
  const fehler = sammleFehler(page);
  await einrichten(page);

  await page.getByRole('link', { name: /Angewandte Mathematik/ }).click();
  await page.getByRole('link', { name: /Probe-Schularbeit Differentialrechnung/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Probe-Schularbeit Differentialrechnung' })).toBeVisible();
  await keinHorizontalesScrollen(page);
  await page.getByRole('button', { name: 'Starten' }).click();
  await expect(page.getByRole('timer')).toHaveText(/^(20:00|19:5\d)$/);
  await page.getByLabel('Deine Antwort').fill('8');
  // echte Schularbeit: keine Rückmeldung während des Schreibens
  await expect(page.getByRole('button', { name: 'Prüfen' })).toHaveCount(0);
  await expect(page.getByText('Richtig', { exact: true })).toHaveCount(0);
  await keinHorizontalesScrollen(page);
  await page.getByRole('button', { name: 'Abgeben', exact: true }).click();
  await page.getByRole('button', { name: 'Trotzdem abgeben' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ergebnis' })).toBeVisible();
  await expect(page.getByText('4 von 12', { exact: true })).toBeVisible();
  await expect(page.getByText('33,3 %')).toBeVisible();
  await expect(page.getByText(/Note 5/)).toBeVisible();
  await keinHorizontalesScrollen(page);

  // Fach zeigt das letzte Ergebnis
  await page.getByRole('link', { name: 'Zurück zu Angewandte Mathematik' }).click();
  await expect(page.getByRole('link', { name: /Probe-Schularbeit Differentialrechnung/ })).toContainText('Zuletzt 4 von 12');

  // Statistik
  await page.getByRole('link', { name: 'Statistik zu diesem Fach' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Statistik' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Prüfungen und Proben' })).toContainText('4 von 12');
  await expect(page.getByRole('img', { name: /Bewertungen pro Tag/ })).toBeVisible();
  await keinHorizontalesScrollen(page);
  await page.getByLabel('Fach').selectOption('');
  await expect(page).toHaveURL(/#\/statistik$/);
  await keinHorizontalesScrollen(page);

  expect(fehler).toEqual([]);
});
