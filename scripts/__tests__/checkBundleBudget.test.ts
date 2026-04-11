// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  computeBundleBudgetSummary,
  evaluateBundleBudget,
  suggestBudget,
  validateBundleBudgetReport,
} from '../checkBundleBudget.mjs';

const report = {
  generatedAt: '2026-04-02T00:00:00.000Z',
  chunks: [
    {
      fileName: 'assets/index-main.js',
      rawBytes: 4000,
      gzipBytes: 1200,
      isEntry: true,
      isDynamicEntry: false,
      isWorker: false,
      imports: ['assets/cn.js'],
      dynamicImports: ['assets/ReaderPage.js'],
      facadeModuleId: '/src/main.tsx',
      moduleIds: ['/src/main.tsx'],
    },
    {
      fileName: 'assets/cn.js',
      rawBytes: 8000,
      gzipBytes: 2200,
      isEntry: false,
      isDynamicEntry: false,
      isWorker: false,
      imports: [],
      dynamicImports: [],
      facadeModuleId: null,
      moduleIds: ['/src/shared/cn.ts'],
    },
    {
      fileName: 'assets/ReaderPage.js',
      rawBytes: 9000,
      gzipBytes: 3100,
      isEntry: false,
      isDynamicEntry: true,
      isWorker: false,
      imports: [],
      dynamicImports: [],
      facadeModuleId: '/src/domains/reader/pages/ReaderPage.tsx',
      moduleIds: ['/src/domains/reader/pages/ReaderPage.tsx'],
    },
    {
      fileName: 'assets/layout.worker.js',
      rawBytes: 7000,
      gzipBytes: 1900,
      isEntry: true,
      isDynamicEntry: false,
      isWorker: true,
      imports: ['assets/worker-shared.js'],
      dynamicImports: [],
      facadeModuleId: '/src/domains/character-graph/workers/layout.worker.ts',
      moduleIds: ['/src/domains/character-graph/workers/layout.worker.ts'],
    },
    {
      fileName: 'assets/worker-shared.js',
      rawBytes: 6000,
      gzipBytes: 1700,
      isEntry: false,
      isDynamicEntry: false,
      isWorker: true,
      imports: [],
      dynamicImports: [],
      facadeModuleId: null,
      moduleIds: ['/src/infra/workers/runtime.ts'],
    },
  ],
};

describe('checkBundleBudget', () => {
  it('computes the expected bundle metrics from a chunk report', () => {
    expect(computeBundleBudgetSummary(report)).toEqual({
      shellInitialJsGzip: 3400,
      largestLazyRouteChunkGzip: 3100,
      largestSharedChunkGzip: 2200,
      largestWorkerChunkGzip: 1900,
    });
  });

  it('passes when all metrics are within budget', () => {
    const result = evaluateBundleBudget(report, {
      shellInitialJsGzip: 4096,
      largestSharedChunkGzip: 3072,
      largestLazyRouteChunkGzip: 4096,
      largestWorkerChunkGzip: 2048,
    });

    expect(result.failures).toEqual([]);
  });

  it('fails when any metric exceeds its configured budget', () => {
    const result = evaluateBundleBudget(report, {
      shellInitialJsGzip: 3000,
      largestSharedChunkGzip: 2048,
      largestLazyRouteChunkGzip: 4096,
      largestWorkerChunkGzip: 2048,
    });

    expect(result.failures).toEqual([
      expect.objectContaining({ key: 'shellInitialJsGzip' }),
      expect.objectContaining({ key: 'largestSharedChunkGzip' }),
    ]);
  });

  it('rejects malformed reports before computing metrics', () => {
    expect(() => validateBundleBudgetReport({ generatedAt: '2026-04-02T00:00:00.000Z' }))
      .toThrow('Bundle budget report must include a chunks array.');
  });

  it('rounds suggested budgets to the next 5 KiB plus 5 KiB headroom', () => {
    expect(suggestBudget(5 * 1024)).toBe(10 * 1024);
    expect(suggestBudget(5 * 1024 + 1)).toBe(15 * 1024);
  });
});
