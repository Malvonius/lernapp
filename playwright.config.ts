import { defineConfig } from '@playwright/test';

const PORT = 4317;

/** E2E gegen den Produktions-Build (vite preview, Basis /lernapp/) im Handy-Format. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    baseURL: `http://localhost:${PORT}/lernapp/`,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/lernapp/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
