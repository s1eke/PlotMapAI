// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  READER_FILE_LINE_LIMIT,
  evaluateReaderArchitecture,
  findInvalidReaderContentRootExports,
  findInvalidReaderLayoutEngineRootExports,
  findReaderFamilyDeepImports,
  findRestrictedReaderImports,
  isPassThroughReaderFile,
} from '../checkReaderArchitecture.mjs';

describe('checkReaderArchitecture', () => {
  it('flags oversized reader files over the configured threshold', () => {
    const result = evaluateReaderArchitecture({
      'src/application/pages/reader/useReaderReadingSurfaceController.tsx':
        `${'line\n'.repeat(READER_FILE_LINE_LIMIT + 1)}`,
    });

    expect(result.oversizedFiles).toEqual([
      expect.objectContaining({
        filePath: 'src/application/pages/reader/useReaderReadingSurfaceController.tsx',
        lineCount: READER_FILE_LINE_LIMIT + 2,
      }),
    ]);
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
      'src/domains/reader-layout-engine/index.ts',
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
      'src/domains/reader-content/index.ts',
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
      'src/domains/reader-layout-engine/index.ts': [
        'export { PagedReaderContent } from \'./paged-runtime\';',
        'export { resolveReaderContentRootProps } from \'./layout-core\';',
        'export { buildStaticPagedChapterTree } from \'./layout-core\';',
      ].join('\n'),
    });

    expect(result.invalidRootBarrelExports).toEqual([
      expect.objectContaining({
        filePath: 'src/domains/reader-layout-engine/index.ts',
        line: 'export { buildStaticPagedChapterTree } from \'./layout-core\';',
      }),
    ]);
  });

  it('includes reader-family deep imports and invalid reader-content barrel exports in the aggregated result', () => {
    const result = evaluateReaderArchitecture({
      'src/domains/reader-layout-engine/hooks/useScrollReaderController.ts':
        'import { ReaderContextProvider } from \'@domains/reader-shell/pages/reader-page/ReaderContext\';\n',
      'src/domains/reader-content/index.ts': [
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
        filePath: 'src/domains/reader-content/index.ts',
        line: 'export { readerContentService } from \'./readerContentService\';',
      }),
    ]);
  });
});
