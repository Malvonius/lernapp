import { defineConfig } from '@playwright/test';

const PORT = 4318;

/**
 * Screenshots aller Screens (nicht Teil von `npm run e2e`): erst `npm run build`, dann
 * `npx playwright test -c playwright.screens.config.ts`. Gegen den Produktions-Build, GitHub gemockt
 * wie in den E2E-Tests. Bilder landen in docs/screenshots/ui-glut/.
 */
export default defineConfig({
  testDir: 'e2e/screens',
  testMatch: '*.screens.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  use: {
    browserName: 'chromium',
    baseURL: `http://localhost:${PORT}/lernapp/`,
    serviceWorkers: 'block',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/lernapp/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
