// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  collectModuleHealthMetrics,
  evaluateModuleHealth,
  findInvalidStableBarrelExports,
  isPassThroughModuleFile,
} from '../moduleHealth.mjs';

describe('moduleHealth', () => {
  const passThroughConfig = {
    enabled: true,
    files: ['src/domains/example/**/*.{ts,tsx}'],
    ignoreIndexFiles: true,
    exportLinePattern: "^export\\s+(type\\s+)?\\{[^}]+\\}\\s+from\\s+['\\\"][^'\\\"]+['\\\"];?$",
    exportStarLinePattern: "^export\\s+\\*\\s+from\\s+['\\\"][^'\\\"]+['\\\"];?$",
  };

  function createConfig(overrides = {}) {
    return {
      metricAllowlist: [],
      metricBudgets: {
        effectiveLines: 200,
      },
      passThrough: {
        ...passThroughConfig,
        enabled: false,
      },
      stableBarrels: [],
      ...overrides,
    };
  }

  it('counts effective lines without blank lines or comments', () => {
    expect(collectModuleHealthMetrics(
      'src/domains/example/sample.ts',
      [
        '// banner comment',
        '',
        'const value = 1;',
        '/* block comment */',
        'const next = value + 1;',
        '',
        'return next;',
      ].join('\n'),
    ).effectiveLines).toBe(3);
  });

  it('flags files that exceed the global effective-line hard cap', () => {
    const result = evaluateModuleHealth({
      'src/domains/example/oversized.ts': [
        '// keep the old 500-line baseline semantics, but count only logical lines',
        '',
        'const first = 1;',
        'const second = 2;',
        'const third = 3;',
        'const fourth = 4;',
      ].join('\n'),
    }, createConfig({
      metricBudgets: {
        effectiveLines: 3,
      },
    }));

    expect(result.metricViolations).toEqual([
      expect.objectContaining({
        actual: 4,
        filePath: 'src/domains/example/oversized.ts',
        limit: 3,
        metric: 'effectiveLines',
      }),
    ]);
  });

  it('reports the longest function with its name and start line', () => {
    expect(collectModuleHealthMetrics(
      'src/domains/example/useThing.ts',
      [
        'const shortThing = () => 1;',
        '',
        'const longThing = () => {',
        '  const first = 1;',
        '  const second = 2;',
        '  const third = first + second;',
        '  return third;',
        '};',
      ].join('\n'),
    )).toMatchObject({
      maxFunctionLines: 6,
      maxFunctionName: 'longThing',
      maxFunctionStartLine: 3,
    });
  });

  it('counts static imports and only treats cross-layer aliases as cross-layer imports', () => {
    expect(collectModuleHealthMetrics(
      'src/domains/example/useThing.ts',
      [
        'import { alpha } from \'@shared/utils/alpha\';',
        'import type { Beta } from \'@application/services/beta\';',
        'import { gamma } from \'@domains/example\';',
        'import { delta } from \'./delta\';',
      ].join('\n'),
    )).toMatchObject({
      crossLayerImportSpecifiers: [
        '@shared/utils/alpha',
        '@application/services/beta',
      ],
      crossLayerImports: 2,
      importCount: 4,
    });
  });

  it('only suppresses allowlisted metrics and leaves other metric violations intact', () => {
    const result = evaluateModuleHealth({
      'src/application/services/compose.ts': [
        'import { one } from \'@domains/library\';',
        'import { two } from \'@domains/settings\';',
        '',
        'const first = 1;',
        'const second = 2;',
        'const third = 3;',
      ].join('\n'),
    }, createConfig({
      metricAllowlist: [
        {
          metrics: ['effectiveLines'],
          path: 'src/application/services/compose.ts',
          reason: 'Allow the wide file but keep import health enforced.',
        },
      ],
      metricBudgets: {
        effectiveLines: 2,
        importCount: 1,
      },
    }));

    expect(result.metricViolations).toEqual([
      expect.objectContaining({
        actual: 2,
        filePath: 'src/application/services/compose.ts',
        limit: 1,
        metric: 'importCount',
      }),
    ]);
  });

  it('does not emit violations for metrics that a scope leaves disabled', () => {
    const result = evaluateModuleHealth({
      'src/application/services/compose.ts': [
        'import { one } from \'@domains/library\';',
        'import { two } from \'@domains/settings\';',
      ].join('\n'),
    }, createConfig({
      metricBudgets: {
        effectiveLines: 10,
      },
    }));

    expect(result.metricViolations).toEqual([]);
  });

  it('detects pass-through re-export files and ignores index barrels', () => {
    expect(isPassThroughModuleFile(
      'src/domains/example/hooks/reexport.ts',
      'export { useThing } from \'./useThing\';\n',
      passThroughConfig,
    )).toBe(true);

    expect(isPassThroughModuleFile(
      'src/domains/example/index.ts',
      'export { useThing } from \'./useThing\';\n',
      passThroughConfig,
    )).toBe(false);
  });

  it('flags stable barrel exports outside the declared public surface', () => {
    expect(findInvalidStableBarrelExports(
      'src/domains/example/index.ts',
      [
        'export { stableThing } from \'./stableThing\';',
        'export { leakedThing } from \'./internalThing\';',
      ].join('\n'),
      [
        {
          allowedLines: [
            'export { stableThing } from \'./stableThing\';',
          ],
          message: 'example root barrel exporting non-stable symbols',
          path: 'src/domains/example/index.ts',
        },
      ],
    )).toEqual([
      {
        filePath: 'src/domains/example/index.ts',
        line: 'export { leakedThing } from \'./internalThing\';',
        message: 'example root barrel exporting non-stable symbols',
      },
    ]);
  });

  it('skips pass-through and stable barrel checks when a scope disables them', () => {
    const result = evaluateModuleHealth({
      'src/domains/example/reexport.ts': 'export { useThing } from \'./useThing\';\n',
      'src/domains/example/index.ts': 'export { leakedThing } from \'./internalThing\';\n',
    }, createConfig());

    expect(result.passThroughFiles).toEqual([]);
    expect(result.invalidStableBarrelExports).toEqual([]);
  });
});
