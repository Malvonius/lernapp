import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, type ConsoleMessage, type Page, type Route } from '@playwright/test';
import { buildIndex } from '../src/format/buildIndex';

/**
 * Ende-zu-Ende im Handy-Format (390×844) gegen den Produktions-Build.
 * GitHub ist komplett gemockt (Inhalt nur aus tests/fixtures/lernstoff-mini).
 */

const FIXTURE_ROOT = fileURLToPath(new URL('../tests/fixtures/lernstoff-mini/', import.meta.url));
/** Selbst geschriebenes Test-Thema mit feindlichem Mindmap-Text (kein echter Lernstoff) */
const XSS_ROOT = fileURLToPath(new URL('./fixtures/lernstoff-xss/', import.meta.url));
const REPO_PFAD = '/repos/Malvonius/lernstoff';
const FORTSCHRITT = '_fortschritt/handy.json';
const TEST_TOKEN = 'e2e-test-token'; // Testwert, kein echtes Token
const INDEX_ETAG = '"e2e-index-1"';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'authorization, accept, content-type, if-none-match',
  'access-control-expose-headers': 'etag',
};

interface Ereignis {
  art: string;
  ziel: string;
  zeit: string;
  geraet: string;
  bewertung?: number;
  richtig?: boolean;
}
interface PutAufruf {
  pfad: string;
  inhalt: { version: number; geraet: string; ereignisse: Ereignis[] };
  sha?: string;
}

/** Fake der GitHub-Contents-API: Lernstoff (raw) lesen, _fortschritt listen/lesen/schreiben. */
class FakeGitHub {
  offline = false;
  /** Anfragen, die im Offline-Modus abgewiesen wurden (Pfad nach /contents/ bzw. „repo“) */
  abgewiesen: string[] = [];
  puts: PutAufruf[] = [];
  private fortschritt = new Map<string, { text: string; sha: string }>();
  private shaZaehler = 0;

  constructor(private dateien: Map<string, string>) {}

  async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    if (this.offline) {
      this.abgewiesen.push(`${req.method()} ${decodeURIComponent(url.pathname)}`);
      return route.abort('internetdisconnected');
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    const auth = req.headers()['authorization'];
    if (auth !== `Bearer ${TEST_TOKEN}`) return this.json(route, 401, { message: 'Bad credentials' });
    if (url.pathname === REPO_PFAD) return this.json(route, 200, { full_name: 'Malvonius/lernstoff' });

    const praefix = `${REPO_PFAD}/contents/`;
    if (!url.pathname.startsWith(praefix)) return this.json(route, 404, { message: 'Not Found' });
    const pfad = url.pathname.slice(praefix.length).split('/').map(decodeURIComponent).join('/');

    if (req.method() === 'PUT') return this.put(route, pfad, req.postDataJSON() as { content: string; sha?: string });

    const raw = (req.headers()['accept'] ?? '').includes('raw');
    if (pfad === '_fortschritt') {
      const namen = [...this.fortschritt.keys()].map((p) => p.slice('_fortschritt/'.length));
      if (namen.length === 0) return this.json(route, 404, { message: 'Not Found' });
      return this.json(route, 200, namen.map((name) => ({ name, type: 'file' })));
    }
    const fort = this.fortschritt.get(pfad);
    if (fort) {
      const etag = `"${fort.sha}"`;
      if (raw && req.headers()['if-none-match'] === etag) return route.fulfill({ status: 304, headers: { ...CORS, etag } });
      if (raw) return route.fulfill({ status: 200, headers: { ...CORS, etag }, body: fort.text });
      return this.json(route, 200, { sha: fort.sha, encoding: 'base64', content: Buffer.from(fort.text).toString('base64') });
    }
    const text = this.dateien.get(pfad);
    if (text === undefined) return this.json(route, 404, { message: 'Not Found' });
    if (pfad === 'index.json' && req.headers()['if-none-match'] === INDEX_ETAG) {
      return route.fulfill({ status: 304, headers: { ...CORS, etag: INDEX_ETAG } });
    }
    const etag = pfad === 'index.json' ? INDEX_ETAG : `"${pfad}"`;
    return route.fulfill({ status: 200, headers: { ...CORS, etag, 'content-type': 'text/plain; charset=utf-8' }, body: text });
  }

  private put(route: Route, pfad: string, body: { content: string; sha?: string }) {
    const vorher = this.fortschritt.get(pfad);
    if ((vorher?.sha ?? undefined) !== body.sha) return this.json(route, 409, { message: 'sha mismatch' });
    const text = Buffer.from(body.content, 'base64').toString('utf8');
    const sha = `sha-${++this.shaZaehler}`;
    this.fortschritt.set(pfad, { text, sha });
    this.puts.push({ pfad, inhalt: JSON.parse(text), sha: body.sha });
    return this.json(route, 200, { content: { sha } });
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
}

async function ladeFixture(root = FIXTURE_ROOT): Promise<Map<string, string>> {
  const { index } = await buildIndex(root, { fix: false, now: new Date('2026-11-22T08:00:00.000Z') });
  const dateien = new Map<string, string>([['index.json', JSON.stringify(index)]]);
  for (const f of index.faecher) {
    for (const t of [...f.kapitel.flatMap((k) => k.themen), ...f.nichtZugeordnet]) {
      if (t.pfad) dateien.set(t.pfad, await readFile(root + t.pfad, 'utf8'));
    }
  }
  return dateien;
}

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
