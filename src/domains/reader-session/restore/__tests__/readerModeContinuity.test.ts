import { describe, expect, it } from 'vitest';
import type { ReaderRestoreTarget } from '@shared/contracts/reader';

import {
  createScrollPagedContinuitySnapshot,
  resolveScrollContinuityTarget,
} from '../readerModeContinuity';

function createRestoreTarget(
  overrides: Partial<ReaderRestoreTarget> = {},
): ReaderRestoreTarget {
  return {
    chapterIndex: 7,
    chapterProgress: 0.42,
    locator: {
      chapterIndex: 7,
      blockIndex: 18,
      kind: 'text' as const,
      lineIndex: 1,
    },
    mode: 'scroll' as const,
    ...overrides,
  };
}

describe('readerModeContinuity', () => {
  it('restores the paired scroll target with the current paged page index', () => {
    const snapshot = createScrollPagedContinuitySnapshot({
      pagedPageIndex: 2,
      sourceTarget: createRestoreTarget(),
    });

    const restoredTarget = resolveScrollContinuityTarget({
      continuitySnapshot: snapshot,
      sourceTarget: createRestoreTarget({
        mode: 'paged' as const,
        locator: {
          chapterIndex: 7,
          blockIndex: 28,
          kind: 'text' as const,
          lineIndex: 0,
          pageIndex: 2,
        },
      }),
    });

    expect(restoredTarget).toMatchObject({
      chapterIndex: 7,
      chapterProgress: 0.42,
      locator: expect.objectContaining({
        blockIndex: 18,
        chapterIndex: 7,
        lineIndex: 1,
        pageIndex: 2,
      }),
      mode: 'scroll',
    });
  });

  it('does not reuse the continuity target after paging to a different page', () => {
    const snapshot = createScrollPagedContinuitySnapshot({
      pagedPageIndex: 2,
      sourceTarget: createRestoreTarget(),
    });

    expect(resolveScrollContinuityTarget({
      continuitySnapshot: snapshot,
      sourceTarget: createRestoreTarget({
        mode: 'paged' as const,
        locator: {
          chapterIndex: 7,
          blockIndex: 28,
          kind: 'text' as const,
          lineIndex: 0,
          pageIndex: 3,
        },
      }),
    })).toBeNull();
  });
});
