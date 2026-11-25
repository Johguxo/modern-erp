import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: isCI ? 'pnpm start' : 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      // Worker de jobs (E2-H3): la importación del catálogo corre en él. Se considera arrancado
      // cuando registra "worker started"; si ya hay uno corriendo, dos consumidores no chocan
      // (el job se bloquea y solo se procesa una vez).
      command: 'pnpm worker',
      wait: { stdout: /worker started/ },
      stdout: 'pipe',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
