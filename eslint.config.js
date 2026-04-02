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
    files: ['src/app/**/*.{ts,tsx}', 'src/domains/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@domains/*/*'],
              message: 'Import other domains only via @domains/<domain>.',
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
