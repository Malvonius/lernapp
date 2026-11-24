import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { FakeGitHub, ladeFixture, TEST_TOKEN, type Ereignis } from '../fakeGithub';

/** Screenshots für Plan 4 (Probe-Schularbeiten, Statistik). Aufruf siehe playwright.screens.config.ts. */
const ZIEL = fileURLToPath(new URL('../../docs/screenshots/plan4/', import.meta.url));

/** Zeitpunkt vor n Tagen (lokale Zeit, Stunde h) als ISO */
function vor(n: number, h = 12, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

/** Lernverlauf eines anderen Geräts: mehrere Wochen, damit Kalender und Diagramme etwas zeigen */
function verlauf(): Ereignis[] {
  const ev: Ereignis[] = [];
  const karten = ['k-a1b2c3', 'k-d4e5f6'];
  const muster = [3, 0, 5, 8, 2, 0, 0, 4, 12, 6, 1, 0, 7, 9, 3, 0, 2, 5, 0, 14, 6, 3, 0, 1, 8, 4, 2, 0, 0, 6, 10, 3, 5, 0, 2, 7, 4, 1];
  muster.forEach((anzahl, n) => {
    for (let i = 0; i < anzahl; i++) {
      const zeit = vor(n + 1, 9 + (i % 10), i);
      if (i % 3 === 2) ev.push({ art: 'uebung', ziel: i % 2 ? 'u-aaa111' : 'u-ccc333', zeit, geraet: 'pc', richtig: i % 4 !== 0 });
      else ev.push({ art: 'karte', ziel: karten[i % 2]!, zeit, geraet: 'pc', bewertung: i % 5 === 0 ? 1 : 3 });
    }
  });
  const pruefungen: [number, string, number, number][] = [
    [20, 'mathe:01 Analysis', 4, 10],
    [12, 'probe:mathe-probe-ableitungen-1', 6.5, 12],
    [6, 'mathe:01 Analysis', 7, 10],
    [2, 'probe:mathe-probe-ableitungen-1', 9.5, 12],
  ];
  for (const [n, ziel, punkte, max] of pruefungen) ev.push({ art: 'pruefung', ziel, zeit: vor(n, 17), geraet: 'pc', punkte, max } as Ereignis);
  return ev;
}

async function bild(page: Page, name: string, ganz = true) {
  // Ganzseitig von oben, sonst landet die klebende Kopfleiste mitten im Bild
  if (ganz) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${ZIEL}${name}.png`, fullPage: ganz });
}

async function keinHorizontalesScrollen(page: Page) {
  const m = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, cw: document.scrollingElement!.clientWidth }));
  expect(m.sw, `horizontales Scrollen auf ${page.url()}`).toBeLessThanOrEqual(m.cw);
}

const VARIANTEN = [
  { name: 'handy', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, themen: ['dunkel', 'hell'] },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, themen: ['dunkel'] },
] as const;

for (const v of VARIANTEN) {
  for (const thema of v.themen) {
    test.describe(`${v.name} ${thema}`, () => {
      test.use({ viewport: v.viewport, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.isMobile ? 2 : 1 });

      test('Probe und Statistik', async ({ page, context }) => {
        await mkdir(ZIEL, { recursive: true });
        const gh = new FakeGitHub(await ladeFixture());
        gh.fortschrittVorbelegen('_fortschritt/pc.json', { version: 1, geraet: 'pc', ereignisse: verlauf() });
        await context.route('https://api.github.com/**', (route) => gh.handle(route));
        const p = `${v.name}-${thema}`;

        await page.goto('./');
        await page.getByLabel('GitHub-Token').fill(TEST_TOKEN);
        await page.getByRole('button', { name: 'Verbindung prüfen' }).click();
        await expect(page.getByRole('link', { name: /Angewandte Mathematik/ })).toBeVisible();
        if (thema === 'hell') {
          await page.getByRole('link', { name: 'Zu den Einstellungen' }).click();
          await page.getByRole('switch', { name: 'Helles Design' }).click();
          await page.getByRole('link', { name: 'Lernapp' }).click();
        }

        // Fach mit Abschnitt Probe-Schularbeiten
        await page.getByRole('link', { name: /Angewandte Mathematik/ }).click();
        const abschnitt = page.getByRole('region', { name: 'Probe-Schularbeiten' });
        await expect(abschnitt).toContainText('Zuletzt 9,5 von 12');
        await bild(page, `${p}-01-fach`);
        await keinHorizontalesScrollen(page);

        // Probe-Start
        await abschnitt.getByRole('link').click();
        await expect(page.getByRole('button', { name: 'Starten' })).toBeVisible();
        await bild(page, `${p}-02-probe-start`);
        await keinHorizontalesScrollen(page);

        // Schreiben ohne Rückmeldung: 1 richtig, 2 falsch, 3 offene Aufgabe mit eigener Lösung
        await page.getByRole('button', { name: 'Starten' }).click();
        await page.getByLabel('Deine Antwort').fill('8');
        await expect(page.getByText('Richtig', { exact: true })).toHaveCount(0);
        await bild(page, `${p}-03-probe-aufgabe`, false);
        await page.getByRole('button', { name: 'Nächste Aufgabe' }).click();
        await page.getByRole('checkbox').nth(2).check();
        await page.getByRole('button', { name: 'Nächste Aufgabe' }).click();
        await page.getByLabel('Deine Lösung').fill("f'(x) = 3x² − 3 = 0, also x = ±1.\nf''(1) = 6 > 0 → Tiefpunkt bei x = 1");
        await bild(page, `${p}-04-probe-offene-aufgabe`, false);
        await keinHorizontalesScrollen(page);
        await page.getByRole('button', { name: 'Abgeben', exact: true }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Ergebnis' })).toBeVisible();
        // Selbsteinschätzung erst auf der Ergebnisseite
        await page.getByRole('button', { name: /^Teilweise/ }).click();
        await expect(page.getByText('6,5 von 12', { exact: true })).toBeVisible();
        await bild(page, `${p}-05-probe-ergebnis-einschaetzen`);
        await keinHorizontalesScrollen(page);
        await page.getByRole('button', { name: 'Ergebnis speichern' }).click();
        await expect(page.getByText('Ergebnis gespeichert')).toBeVisible();
        await keinHorizontalesScrollen(page);

        // Statistik
        await page.getByRole('link', { name: 'Lernapp' }).click();
        await page.getByRole('link', { name: 'Statistik' }).click();
        await expect(page.getByRole('region', { name: 'Glut-Kalender' })).toBeVisible();
        await bild(page, `${p}-06-statistik`);
        await keinHorizontalesScrollen(page);
        // Ablesezeile beim Berühren einer Säule
        await page.locator('.diagramm__mark').nth(12).hover();
        await bild(page, `${p}-07-statistik-hover`, false);
      });
    });
  }
}
