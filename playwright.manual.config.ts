import { defineConfig } from '@playwright/test';

import defaultConfig from './playwright.config';

export default defineConfig({
  ...defaultConfig,
  testIgnore: [],
  testMatch: ['**/*.manual.spec.ts'],
});
