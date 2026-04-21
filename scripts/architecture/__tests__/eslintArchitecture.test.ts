// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { buildArchitectureLintConfigs } from '../eslintArchitecture.mjs';

describe('buildArchitectureLintConfigs', () => {
  it('generates the existing architecture lint restrictions from contract data', () => {
    expect(buildArchitectureLintConfigs()).toEqual([
      {
        files: ['src/app/**/*.{ts,tsx}', 'src/application/**/*.{ts,tsx}'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['@domains/*/*'],
                  message: '仅允许通过 @domains/<domain> 导出桶引入领域代码。',
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
                  message: 'book-import 仅作为解析器，不得直接访问 Dexie。',
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
                  message: 'reader-content 必须使用应用层注册的读模型，而非直接操作 Dexie。',
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
                  message: '领域层代码不能依赖应用层代码。',
                },
                {
                  group: ['@application/*', '@application/*/*'],
                  message: '领域层代码不能依赖业务逻辑层代码。',
                },
                {
                  group: ['@domains/*', '!@domains/reader-*', '!@domains/reader-*/*'],
                  message: '阅读器相关领域不能依赖与之无关的领域。',
                },
                {
                  group: ['@domains/reader-*/*'],
                  message: '阅读器相关代码必须通过导出桶（barrel）引入同级领域，通过相对路径引入同领域模块。',
                },
                {
                  group: ['@domains/*/*', '!@domains/reader-*/*'],
                  message: '阅读器相关领域不能依赖其他领域内部实现。',
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
                  message: '领域内部不能相互依赖。',
                },
                {
                  group: ['@domains/*/*'],
                  message: '领域层代码不能依赖其他领域的内部实现。',
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
                  message: '共享层和基础设施层不能依赖领域层代码。',
                },
              ],
            },
          ],
        },
      },
    ]);
  });
});
