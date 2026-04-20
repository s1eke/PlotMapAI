import { react as aliReact } from 'eslint-config-ali';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

import { buildArchitectureLintConfigs } from './scripts/architecture/eslintArchitecture.mjs';

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  ...aliReact,
  reactRefresh.configs.vite,
  {
    files: [
      'scripts/**/*.test.ts',
      'src/**/__tests__/**/*.{ts,tsx}',
      'src/test/**/*.{ts,tsx}',
      'vitest.config.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: [
      'playwright.config.ts',
      'playwright.manual.config.ts',
      'tests/playwright/**/*.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.playwright.json'],
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['scripts/**/*.{mjs,js}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/infra/storage/**',
      'src/i18n/config.ts',
      'src/**/__tests__/**',
      'src/test/**',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'Use infra/storage instead of direct localStorage access.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'localStorage',
          message: 'Use infra/storage instead of direct localStorage access.',
        },
      ],
    },
  },
  ...buildArchitectureLintConfigs(),
]);
