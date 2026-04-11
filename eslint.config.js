import { react as aliReact } from 'eslint-config-ali';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

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
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@domains/*/*'],
              message: 'Import domains only via @domains/<domain>.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domains/book-import/**/*.{ts,tsx}'],
    ignores: ['src/domains/book-import/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@infra/db', '@infra/db/*'],
              message: 'book-import is parse-only and must not access Dexie directly.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domains/reader-content/**/*.{ts,tsx}'],
    ignores: ['src/domains/reader-content/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@infra/db', '@infra/db/*'],
              message: 'reader-content must consume application-registered read models instead of Dexie directly.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domains/reader-*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@app/*/*'],
              message: 'domain code must not depend on app code.',
            },
            {
              group: ['@application/*', '@application/*/*'],
              message: 'domain code must not depend on application code.',
            },
            {
              group: ['@domains/*', '!@domains/reader-*', '!@domains/reader-*/*'],
              message: 'reader-family domain code must not depend on unrelated domains.',
            },
            {
              group: ['@domains/reader-*/*'],
              message: 'reader-family code must import sibling reader domains via barrels and same-domain modules via relative paths.',
            },
            {
              group: ['@domains/*/*', '!@domains/reader-*/*'],
              message: 'reader-family domain code must not depend on unrelated domain internals.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domains/**/*.{ts,tsx}'],
    ignores: ['src/domains/reader-*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@app/*/*'],
              message: 'domain code must not depend on app code.',
            },
            {
              group: ['@application/*', '@application/*/*'],
              message: 'domain code must not depend on application code.',
            },
            {
              group: ['@domains/*'],
              message: 'domain code must not depend on other domains.',
            },
            {
              group: ['@domains/*/*'],
              message: 'domain code must not depend on other domain internals.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}', 'src/infra/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@domains/*',
                '@domains/*/*',
                '../domains/*',
                '../domains/*/*',
                '../../domains/*',
                '../../domains/*/*',
                '../../../domains/*',
                '../../../domains/*/*',
              ],
              message: 'shared and infra must not depend on domain code.',
            },
          ],
        },
      ],
    },
  },
]);
