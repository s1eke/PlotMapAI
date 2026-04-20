import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetReaderSessionStoreForTests } from '../../store/readerSessionStore';
import { usePendingRestoreTargetController } from '../usePendingRestoreTargetController';

function createRestoreTarget(overrides: Partial<{
  chapterIndex: number;
  mode: 'scroll' | 'paged' | 'summary';
  chapterProgress: number;
  locatorBoundary: 'start' | 'end';
  locator: {
    blockIndex: number;
    chapterIndex: number;
    kind: 'heading' | 'text' | 'image';
    lineIndex?: number;
    pageIndex?: number;
  };
}> = {}) {
  return {
    chapterIndex: 5,
    mode: 'paged' as const,
    chapterProgress: 0.4,
    locatorBoundary: undefined,
    locator: {
      blockIndex: 6,
      chapterIndex: 5,
      kind: 'text' as const,
      lineIndex: 0,
      pageIndex: 2,
      ...overrides.locator,
    },
    ...overrides,
  };
}

describe('usePendingRestoreTargetController', () => {
  beforeEach(() => {
    resetReaderSessionStoreForTests();
  });

  it('keeps a forced restore target while props are still lagging behind with null', () => {
    const previousTarget = createRestoreTarget({
      chapterProgress: 0.2,
      mode: 'scroll',
      locator: {
        blockIndex: 2,
        chapterIndex: 5,
        kind: 'text',
        lineIndex: 0,
        pageIndex: 0,
      },
    });
    const nextTarget = createRestoreTarget({
      chapterProgress: 0.65,
    });
    const suppressScrollSyncTemporarily = vi.fn();
    const { result, rerender } = renderHook(
      (pendingRestoreTarget) => usePendingRestoreTargetController({
        pendingRestoreTarget,
        persistence: {
          suppressScrollSyncTemporarily,
        },
      }),
      {
        initialProps: previousTarget,
      },
    );

    act(() => {
      result.current.setPendingRestoreTarget(nextTarget, { force: true });
    });

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject(nextTarget);

    rerender(null);

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject(nextTarget);

    rerender(nextTarget);

    expect(result.current.pendingRestoreTargetRef.current).toMatchObject(nextTarget);
  });
});
