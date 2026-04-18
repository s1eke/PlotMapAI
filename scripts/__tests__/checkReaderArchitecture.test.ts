// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { loadArchitectureContract } from '../architecture/contracts.mjs';
import {
  evaluateReaderArchitecture,
  findInvalidReaderContentRootExports,
  findInvalidReaderLayoutEngineRootExports,
  findReaderFamilyDeepImports,
  findRestrictedReaderImports,
  isPassThroughReaderFile,
} from '../checkReaderArchitecture.mjs';

describe('checkReaderArchitecture', () => {
  const { metricDefaults, readerArchitecture } = loadArchitectureContract();
  const readerMetricBudgets = {
    ...metricDefaults.metricBudgets,
    ...readerArchitecture.metricBudgets,
  };
  const readerLayoutEngineBarrel = readerArchitecture.stableBarrels.find(
    (entry) => entry.path === 'src/domains/reader-layout-engine/index.ts',
  );
  const readerContentBarrel = readerArchitecture.stableBarrels.find(
    (entry) => entry.path === 'src/domains/reader-content/index.ts',
  );

  it('uses the shared effective-line hard cap for reader files', () => {
    const lineCount = readerMetricBudgets.effectiveLines + 1;
    const result = evaluateReaderArchitecture({
      'src/application/pages/reader/useReaderReadingSurfaceController.tsx':
        `${'const line = 1;\n'.repeat(lineCount)}`,
    });

    expect(result.metricViolations).toContainEqual(
      expect.objectContaining({
        actual: lineCount,
        filePath: 'src/application/pages/reader/useReaderReadingSurfaceController.tsx',
        limit: readerMetricBudgets.effectiveLines,
        metric: 'effectiveLines',
      }),
    );
  });

  it('flags reader files with functions over the configured health threshold', () => {
    const bodyLineCount = readerMetricBudgets.maxFunctionLines + 1;
    const result = evaluateReaderArchitecture({
      'src/domains/reader-layout-engine/hooks/useReaderMetrics.ts': [
        'export const useReaderMetrics = () => {',
        ...Array.from({ length: bodyLineCount }, (_, index) => `  const line${index} = ${index};`),
        '  return line0;',
        '};',
      ].join('\n'),
    });

    expect(result.metricViolations).toContainEqual(
      expect.objectContaining({
        filePath: 'src/domains/reader-layout-engine/hooks/useReaderMetrics.ts',
        functionName: 'useReaderMetrics',
        limit: readerMetricBudgets.maxFunctionLines,
        metric: 'maxFunctionLines',
        startLine: 1,
      }),
    );
  });

  it('flags reader files with excessive imports and cross-layer imports', () => {
    const importLines = Array.from({ length: readerMetricBudgets.importCount + 1 }, (_, index) => (
      `import { thing${index} } from '@domains/reader-content';`
    ));
    const result = evaluateReaderArchitecture({
      'src/application/pages/reader/useReaderMetrics.ts': [
        ...importLines,
        'export const useReaderMetrics = () => null;',
      ].join('\n'),
    });

    expect(result.metricViolations).toContainEqual(
      expect.objectContaining({
        actual: readerMetricBudgets.importCount + 1,
        filePath: 'src/application/pages/reader/useReaderMetrics.ts',
        limit: readerMetricBudgets.importCount,
        metric: 'importCount',
      }),
    );
    expect(result.metricViolations).toContainEqual(
      expect.objectContaining({
        actual: readerMetricBudgets.importCount + 1,
        filePath: 'src/application/pages/reader/useReaderMetrics.ts',
        limit: readerMetricBudgets.crossLayerImports,
        metric: 'crossLayerImports',
        specifiers: Array.from({ length: readerMetricBudgets.importCount + 1 }, () => '@domains/reader-content'),
      }),
    );
  });

  it('finds restricted reader-layout-engine imports into sibling reader domains', () => {
    expect(findRestrictedReaderImports(
      'src/domains/reader-layout-engine/hooks/useScrollReaderController.ts',
      [
        'import type { ReaderChapterCacheApi } from \'@domains/reader-content\';',
        'import type { ReaderSessionSnapshot } from "@domains/reader-session";',
        'import { something } from \'@shared/utils/cn\';',
      ].join('\n'),
    )).toEqual([
      '@domains/reader-content',
      '@domains/reader-session',
    ]);
  });

  it('identifies pass-through reader files but ignores standard barrel index files', () => {
    expect(isPassThroughReaderFile(
      'src/domains/reader-shell/hooks/sessionStore.ts',
      'export { resetReaderSessionStoreForTests } from \'@domains/reader-session\';\n',
    )).toBe(true);

    expect(isPassThroughReaderFile(
      'src/domains/reader-shell/index.ts',
      'export { ReaderProvider } from \'./pages/reader-page/ReaderContext\';\n',
    )).toBe(false);
  });

  it('flags reader-layout-engine root barrel exports outside the stable public surface', () => {
    expect(findInvalidReaderLayoutEngineRootExports(
      readerLayoutEngineBarrel?.path ?? 'src/domains/reader-layout-engine/index.ts',
      [
        'export { PagedReaderContent } from \'./paged-runtime\';',
        'export { buildStaticPagedChapterTree } from \'./layout-core\';',
      ].join('\n'),
    )).toEqual([
      'export { buildStaticPagedChapterTree } from \'./layout-core\';',
    ]);
  });

  it('flags reader-content root barrel exports outside the stable public surface', () => {
    expect(findInvalidReaderContentRootExports(
      readerContentBarrel?.path ?? 'src/domains/reader-content/index.ts',
      [
        'export type { Chapter, ChapterContent, ReaderChapterCacheApi } from \'@shared/contracts/reader\';',
        'export { readerContentService } from \'./readerContentService\';',
      ].join('\n'),
    )).toEqual([
      'export { readerContentService } from \'./readerContentService\';',
    ]);
  });

  it('flags reader-family deep imports into domain internals', () => {
    expect(findReaderFamilyDeepImports(
      'src/domains/reader-layout-engine/hooks/useScrollReaderController.ts',
      [
        'import { ReaderContextProvider } from \'@domains/reader-shell/pages/reader-page/ReaderContext\';',
        'import { something } from \'@domains/reader-media\';',
      ].join('\n'),
    )).toEqual([
      '@domains/reader-shell/pages/reader-page/ReaderContext',
    ]);
  });

  it('includes invalid reader-layout-engine root barrel exports in the aggregated result', () => {
    const result = evaluateReaderArchitecture({
      [readerLayoutEngineBarrel?.path ?? 'src/domains/reader-layout-engine/index.ts']: [
        'export { PagedReaderContent } from \'./paged-runtime\';',
        'export { resolveReaderContentRootProps } from \'./layout-core\';',
        'export { buildStaticPagedChapterTree } from \'./layout-core\';',
      ].join('\n'),
    });

    expect(result.invalidRootBarrelExports).toEqual([
      expect.objectContaining({
        filePath: readerLayoutEngineBarrel?.path ?? 'src/domains/reader-layout-engine/index.ts',
        line: 'export { buildStaticPagedChapterTree } from \'./layout-core\';',
      }),
    ]);
  });

  it('includes reader-family deep imports and invalid reader-content barrel exports in the aggregated result', () => {
    const result = evaluateReaderArchitecture({
      'src/domains/reader-layout-engine/hooks/useScrollReaderController.ts':
        'import { ReaderContextProvider } from \'@domains/reader-shell/pages/reader-page/ReaderContext\';\n',
      [readerContentBarrel?.path ?? 'src/domains/reader-content/index.ts']: [
        'export type { Chapter, ChapterContent, ReaderChapterCacheApi } from \'@shared/contracts/reader\';',
        'export { readerContentService } from \'./readerContentService\';',
      ].join('\n'),
    });

    expect(result.readerFamilyDeepImports).toEqual([
      expect.objectContaining({
        filePath: 'src/domains/reader-layout-engine/hooks/useScrollReaderController.ts',
        specifier: '@domains/reader-shell/pages/reader-page/ReaderContext',
      }),
    ]);
    expect(result.invalidReaderContentRootExports).toEqual([
      expect.objectContaining({
        filePath: readerContentBarrel?.path ?? 'src/domains/reader-content/index.ts',
        line: 'export { readerContentService } from \'./readerContentService\';',
      }),
    ]);
  });
});
