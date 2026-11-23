import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { FakeGitHub, ladeFixture, TEST_TOKEN } from '../fakeGithub';

const ZIEL = fileURLToPath(new URL('../../docs/screenshots/ui-glut/', import.meta.url));

/** Mittag vor n Tagen (lokale Zeit) als ISO */
function tageZurueck(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

async function bild(page: Page, name: string, ganz = true) {
  await page.waitForTimeout(700); // Einblenden/Flip fertig
  await page.screenshot({ path: `${ZIEL}${name}.png`, fullPage: ganz });
}

async function keinHorizontalesScrollen(page: Page) {
  const m = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, cw: document.scrollingElement!.clientWidth }));
  expect(m.sw, `horizontales Scrollen auf ${page.url()}`).toBeLessThanOrEqual(m.cw);
}

const VARIANTEN = [
  { name: 'handy', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  // schmalstes Ziel (360 px) mit reduzierter Bewegung: kein Flip, keine Funken, trotzdem alles bedienbar
  { name: 'schmal-ruhig', viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' },
] as const;

for (const v of VARIANTEN) {
  for (const thema of ['dunkel', 'hell'] as const) {
    if (v.name === 'schmal-ruhig' && thema === 'hell') continue;
    test.describe(`${v.name} ${thema}`, () => {
      test.use({
        viewport: v.viewport,
        isMobile: v.isMobile,
        hasTouch: v.hasTouch,
        deviceScaleFactor: v.isMobile ? 2 : 1,
        reducedMotion: 'reducedMotion' in v ? v.reducedMotion : 'no-preference',
      });

      test('alle Screens', async ({ page, context }) => {
        await mkdir(ZIEL, { recursive: true });
        const gh = new FakeGitHub(await ladeFixture());
        // Lerntage vorgestern und gestern von einem anderen Gerät: Start zeigt eine glimmende 2er-Serie
        gh.fortschrittVorbelegen('_fortschritt/pc.json', {
          version: 1,
          geraet: 'pc',
          ereignisse: [
            { art: 'karte', ziel: 'k-a1b2c3', zeit: tageZurueck(2), geraet: 'pc', bewertung: 3 },
            { art: 'uebung', ziel: 'u-aaa111', zeit: tageZurueck(1), geraet: 'pc', richtig: true },
          ],
        });
        await context.route('https://api.github.com/**', (route) => gh.handle(route));
        const p = `${v.name}-${thema}`;

        await page.goto('./');
        await expect(page.getByRole('heading', { name: 'Einrichten' })).toBeVisible();
        await bild(page, `${p}-01-einrichten`);
        await page.getByLabel('GitHub-Token').fill(TEST_TOKEN);
        await page.getByRole('button', { name: 'Verbindung prüfen' }).click();
        await expect(page.getByRole('link', { name: /Angewandte Mathematik/ })).toBeVisible();

        if (thema === 'hell') {
          await page.getByRole('link', { name: 'Zu den Einstellungen' }).click();
          await page.getByRole('switch', { name: 'Helles Design' }).click();
          await page.getByRole('link', { name: 'Lernapp' }).click();
        }
        await expect(page.getByRole('region', { name: 'Glut' })).toHaveAttribute('data-zustand', 'glimmt');
        await bild(page, `${p}-02-start-glimmt`, false);
        await keinHorizontalesScrollen(page);

        await page.getByRole('link', { name: /Angewandte Mathematik/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Angewandte Mathematik' })).toBeVisible();
        await bild(page, `${p}-03-fach`);
        await keinHorizontalesScrollen(page);

        await page.getByRole('link', { name: /Ableitungen/ }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Ableitungen' })).toBeVisible();
        await bild(page, `${p}-04-thema-text`);
        await keinHorizontalesScrollen(page);
        await page.getByRole('tab', { name: 'Karten' }).click();
        await page.getByRole('button', { name: 'Antwort zeigen' }).first().click();
        await bild(page, `${p}-05-thema-karten`);
        if (await page.getByRole('tab', { name: 'Mindmap' }).count()) {
          await page.getByRole('tab', { name: 'Mindmap' }).click();
          await bild(page, `${p}-06-thema-mindmap`);
        }
        await page.getByRole('tab', { name: 'Übungen' }).click();
        await page.getByRole('textbox', { name: 'Deine Antwort' }).fill('12');
        await page.getByRole('button', { name: 'Prüfen' }).first().click();
        await bild(page, `${p}-07-thema-uebungen`);
        await keinHorizontalesScrollen(page);

        // Frag-Bob-Sheet
        await page.getByRole('button', { name: 'Frag Bob' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Frag Bob' })).toBeVisible();
        await page.getByLabel('Deine Frage').fill('Warum ist die Ableitung von x hoch 3 gleich 3x²?');
        await bild(page, `${p}-08-frag-bob`, false);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);

        // Wiederholen: vor und nach dem Aufdecken
        await page.getByRole('link', { name: 'Dieses Thema wiederholen' }).click();
        await expect(page.getByRole('button', { name: 'Antwort zeigen' })).toBeVisible();
        await bild(page, `${p}-09-wiederholen-vorher`, false);
        await page.getByRole('button', { name: 'Antwort zeigen' }).click();
        await expect(page.getByRole('button', { name: /^Gut/ })).toBeVisible();
        await bild(page, `${p}-10-wiederholen-nachher`, false);
        await keinHorizontalesScrollen(page);
        await page.getByRole('button', { name: /^Gut/ }).click();

        await page.getByRole('link', { name: 'Lernapp' }).click();
        await expect(page.getByRole('region', { name: 'Glut' })).toHaveAttribute('data-zustand', 'brennt');
        await bild(page, `${p}-11-start-brennt`);

        await page.getByRole('link', { name: 'Prüfung starten' }).click();
        await bild(page, `${p}-12-pruefung`);
        await keinHorizontalesScrollen(page);

        await page.getByRole('link', { name: 'Zur Suche' }).click();
        await page.getByRole('searchbox').fill('Ableit');
        await bild(page, `${p}-13-suche`);

        await page.getByRole('link', { name: 'Zu den Einstellungen' }).click();
        await bild(page, `${p}-14-einstellungen`);
        await keinHorizontalesScrollen(page);
      });
    });
  }
}
