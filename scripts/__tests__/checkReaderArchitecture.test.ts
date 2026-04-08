// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  READER_FILE_LINE_LIMIT,
  evaluateReaderArchitecture,
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
});
