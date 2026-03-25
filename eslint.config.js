import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
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
])
