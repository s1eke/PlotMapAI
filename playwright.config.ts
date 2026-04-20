import { defineConfig, devices } from '@playwright/test';

const PORT = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4273', 10);
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const SHOULD_REUSE_EXISTING_SERVER =
  process.env.CI !== 'true' && process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
  testDir: './tests/playwright',
  testIgnore: ['**/*.manual.spec.ts'],
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    colorScheme: 'light',
    contextOptions: {
      reducedMotion: 'reduce',
    },
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
      },
      testMatch: ['smoke/**/*.spec.ts', 'flow/**/*.spec.ts'],
    },
  ],
  webServer: {
    command: `npm run preview:trace -- --host ${HOST} --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: SHOULD_REUSE_EXISTING_SERVER,
    timeout: 180_000,
  },
});
