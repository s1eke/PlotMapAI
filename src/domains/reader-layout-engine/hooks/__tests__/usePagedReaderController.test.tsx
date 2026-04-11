import type { ReaderLocator } from '@shared/contracts/reader';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderContextWrapper } from '@test/readerRuntimeTestUtils';

import { usePagedReaderLayout } from '../../paged-runtime/internal';
import { usePagedReaderController } from '../usePagedReaderController';

const pagedControllerTestState = vi.hoisted(() => ({
  chapterPreviews: {
    nextChapterPreview: null,
    pagedChapters: [],
    previousChapterPreview: null,
  },
  currentPagedLocator: null as unknown,
  pagedLayoutsByIndex: new Map<number, unknown>(),
  readyChapterIndex: 0,
}));

vi.mock('../../paged-runtime/internal', async () => {
  const actual = await vi.importActual<typeof import('../../paged-runtime/internal')>(
    '../../paged-runtime/internal',
  );

  return {
    ...actual,
    usePagedChapterPreviews: vi.fn(() => pagedControllerTestState.chapterPreviews),
    usePagedReaderLayout: vi.fn(() => ({
      readyChapterIndex: pagedControllerTestState.readyChapterIndex,
    })),
  };
});

vi.mock('../../render-cache/internal', () => ({
  useReaderRenderCache: vi.fn(() => ({
    pagedLayouts: pagedControllerTestState.pagedLayoutsByIndex,
  })),
}));

vi.mock('../../layout-core/internal', () => ({
  resolveCurrentPagedLocator: vi.fn(() => pagedControllerTestState.currentPagedLocator),
}));

function createLocator(chapterIndex: number, pageIndex: number): ReaderLocator {
  return {
    blockIndex: pageIndex,
    chapterIndex,
    kind: 'text',
    pageIndex,
  };
}

function createChapter(index: number) {
  return {
    index,
    title: `Chapter ${index + 1}`,
    wordCount: 120,
  };
}

function createChapterContent(index: number, totalChapters: number) {
  return {
    ...createChapter(index),
    contentFormat: 'plain' as const,
    contentVersion: 1,
    hasNext: index < totalChapters - 1,
    hasPrev: index > 0,
    plainText: `Chapter ${index + 1} text`,
    richBlocks: [],
    totalChapters,
  };
}

function createPagedLayout(pageCount: number) {
  return {
    pageSlices: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index}`,
    })),
  };
}

function createSessionCommands() {
  return {
    hasUserInteractedRef: { current: false },
    persistReaderState: vi.fn(),
    setChapterIndex: vi.fn(),
  };
}

function createHookProps(
  overrides: Partial<Parameters<typeof usePagedReaderController>[0]> = {},
): Parameters<typeof usePagedReaderController>[0] {
  const chapters = overrides.chapters ?? [createChapter(0), createChapter(1)];
  const currentChapter = overrides.currentChapter ?? createChapterContent(0, chapters.length);

  return {
    enabled: overrides.enabled ?? true,
    novelId: overrides.novelId ?? 1,
    chapters,
    currentChapter,
    chapterDataRevision: overrides.chapterDataRevision ?? 1,
    sessionSnapshot: overrides.sessionSnapshot ?? {
      chapterIndex: currentChapter?.index ?? 0,
    },
    sessionCommands: overrides.sessionCommands ?? createSessionCommands(),
    cache: overrides.cache ?? {
      snapshotCachedChapters: () => new Map(),
    },
    fetchChapterContent: overrides.fetchChapterContent ?? vi.fn(async (index: number) => (
      createChapterContent(index, chapters.length)
    )),
    preferences: overrides.preferences ?? {
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 20,
    },
    pendingRestoreTarget: overrides.pendingRestoreTarget ?? null,
    pendingRestoreTargetRef: overrides.pendingRestoreTargetRef ?? { current: null },
    getRestoreAttempt: overrides.getRestoreAttempt ?? (() => 0),
    recordRestoreResult: overrides.recordRestoreResult
      ?? (() => ({ scheduledRetry: false })),
    clearPendingRestoreTarget: overrides.clearPendingRestoreTarget ?? vi.fn(),
    stopRestoreMask: overrides.stopRestoreMask ?? vi.fn(),
    beforeChapterChange: overrides.beforeChapterChange,
  };
}

function setupHook(
  overrides: Partial<Parameters<typeof usePagedReaderController>[0]> = {},
) {
  const sessionCommands = overrides.sessionCommands ?? createSessionCommands();
  const cache = overrides.cache ?? {
    snapshotCachedChapters: () => new Map(),
  };
  const fetchChapterContent = overrides.fetchChapterContent ?? vi.fn(async (index: number) => (
    createChapterContent(
      index,
      (overrides.chapters ?? [createChapter(0), createChapter(1)]).length,
    )
  ));
  const pendingRestoreTargetRef = overrides.pendingRestoreTargetRef ?? { current: null };
  const clearPendingRestoreTarget = overrides.clearPendingRestoreTarget ?? vi.fn();
  const stopRestoreMask = overrides.stopRestoreMask ?? vi.fn();
  const beforeChapterChange = overrides.beforeChapterChange ?? vi.fn();
  const { value, Wrapper } = createReaderContextWrapper();

  const buildProps = (
    nextOverrides: Partial<Parameters<typeof usePagedReaderController>[0]> = {},
  ) => createHookProps({
    ...overrides,
    ...nextOverrides,
    beforeChapterChange,
    cache,
    clearPendingRestoreTarget,
    fetchChapterContent,
    pendingRestoreTargetRef,
    sessionCommands,
    stopRestoreMask,
  });

  const renderResult = renderHook(
    (props: Parameters<typeof usePagedReaderController>[0]) => usePagedReaderController(props),
    {
      initialProps: buildProps(),
      wrapper: Wrapper,
    },
  );

  return {
    ...renderResult,
    beforeChapterChange,
    buildProps,
    contextValue: value,
    pendingRestoreTargetRef,
    sessionCommands,
  };
}

describe('usePagedReaderController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pagedControllerTestState.chapterPreviews = {
      nextChapterPreview: null,
      pagedChapters: [],
      previousChapterPreview: null,
    };
    pagedControllerTestState.currentPagedLocator = null;
    pagedControllerTestState.pagedLayoutsByIndex = new Map();
    pagedControllerTestState.readyChapterIndex = 0;
  });

  it('resets paging state, pending targets, and attached refs when paged mode is disabled', async () => {
    pagedControllerTestState.pagedLayoutsByIndex = new Map([
      [0, createPagedLayout(3)],
      [1, createPagedLayout(2)],
    ]);
    pagedControllerTestState.readyChapterIndex = 0;
    pagedControllerTestState.currentPagedLocator = createLocator(0, 1);

    const { contextValue, result, rerender, buildProps } = setupHook();
    const contentElement = document.createElement('div');
    const viewportElement = document.createElement('div');

    act(() => {
      result.current.handlePagedContentRef(contentElement);
      result.current.handlePagedViewportRef(viewportElement);
      result.current.goToNextPageSilently();
      result.current.goToChapter(1, 'end');
    });

    expect(result.current.pageIndex).toBe(1);
    expect(result.current.pendingPageTarget).toBe('end');
    expect(contextValue.pagedViewportRef.current).toBe(viewportElement);
    expect(contextValue.getPendingPageTarget()).toBe('end');

    act(() => {
      rerender(buildProps({ enabled: false }));
    });

    await waitFor(() => {
      expect(result.current.pageIndex).toBe(0);
    });

    expect(result.current.pageCount).toBe(1);
    expect(result.current.pendingPageTarget).toBeNull();
    expect(contextValue.getPendingPageTarget()).toBeNull();
    expect(contextValue.getPagedState()).toEqual({ pageCount: 1, pageIndex: 0 });
    expect(contextValue.pagedViewportRef.current).toBeNull();
    expect(vi.mocked(usePagedReaderLayout)).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: false,
      pagedContentElement: null,
      pagedViewportElement: null,
    }));
  });

  it('turns pages within the current chapter without triggering chapter navigation', async () => {
    pagedControllerTestState.pagedLayoutsByIndex = new Map([
      [0, createPagedLayout(3)],
    ]);
    pagedControllerTestState.readyChapterIndex = 0;
    pagedControllerTestState.currentPagedLocator = createLocator(0, 1);

    const { result, sessionCommands } = setupHook();

    act(() => {
      result.current.goToNextPage();
    });

    expect(result.current.pageIndex).toBe(1);
    expect(result.current.pageTurnDirection).toBe('next');
    expect(result.current.pageTurnToken).toBe(1);
    expect(sessionCommands.setChapterIndex).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(sessionCommands.persistReaderState).toHaveBeenLastCalledWith(expect.objectContaining({
        canonical: expect.objectContaining({
          chapterIndex: 0,
          blockIndex: 1,
          kind: 'text',
        }),
        hints: expect.objectContaining({
          pageIndex: 1,
          contentMode: 'paged',
        }),
      }));
    });
  });

  it('commits chapter navigation at page boundaries and tracks the pending page target', () => {
    pagedControllerTestState.pagedLayoutsByIndex = new Map([
      [0, createPagedLayout(1)],
      [1, createPagedLayout(2)],
    ]);
    pagedControllerTestState.readyChapterIndex = 0;

    const { beforeChapterChange, contextValue, result, sessionCommands } = setupHook();

    act(() => {
      result.current.goToNextPage();
    });

    expect(beforeChapterChange).toHaveBeenCalledTimes(1);
    expect(sessionCommands.hasUserInteractedRef.current).toBe(true);
    expect(contextValue.getChapterChangeSource()).toBe('navigation');
    expect(contextValue.getPendingPageTarget()).toBe('start');
    expect(result.current.pendingPageTarget).toBe('start');
    expect(sessionCommands.setChapterIndex).toHaveBeenCalledWith(1);
    expect(sessionCommands.persistReaderState).toHaveBeenLastCalledWith({
      canonical: {
        chapterIndex: 1,
        edge: 'start',
      },
      hints: {
        contentMode: 'paged',
      },
    });
    expect(result.current.pageTurnDirection).toBe('next');
    expect(result.current.pageTurnToken).toBe(1);
  });

  it('replays queued directional navigation after the target chapter becomes ready', () => {
    const chapter0 = createChapterContent(0, 2);
    const chapter1 = createChapterContent(1, 2);

    pagedControllerTestState.pagedLayoutsByIndex = new Map([
      [0, createPagedLayout(1)],
      [1, createPagedLayout(2)],
    ]);
    pagedControllerTestState.readyChapterIndex = 0;

    const { result, rerender, buildProps, sessionCommands } = setupHook({
      currentChapter: chapter0,
      sessionSnapshot: {
        chapterIndex: 0,
      },
    });

    act(() => {
      result.current.goToNextPage();
      result.current.goToNextPage();
    });

    expect(sessionCommands.setChapterIndex).toHaveBeenCalledTimes(1);
    expect(result.current.pageTurnToken).toBe(1);
    expect(result.current.pageIndex).toBe(0);

    pagedControllerTestState.readyChapterIndex = 1;

    act(() => {
      rerender(buildProps({
        currentChapter: chapter1,
        sessionSnapshot: {
          chapterIndex: 1,
        },
      }));
    });

    expect(result.current.pageIndex).toBe(1);
    expect(result.current.pageTurnDirection).toBe('next');
    expect(result.current.pageTurnToken).toBe(2);
    expect(sessionCommands.setChapterIndex).toHaveBeenCalledTimes(1);
  });

  it('persists the paged locator only when no restore target is pending and chapter alignment matches', async () => {
    const locator = createLocator(0, 0);
    const pendingRestoreTargetRef = {
      current: {
        chapterIndex: 0,
        mode: 'paged' as const,
      },
    };

    pagedControllerTestState.pagedLayoutsByIndex = new Map([
      [0, createPagedLayout(2)],
      [1, createPagedLayout(2)],
    ]);
    pagedControllerTestState.readyChapterIndex = 0;
    pagedControllerTestState.currentPagedLocator = locator;

    const { rerender, buildProps, sessionCommands } = setupHook({
      pendingRestoreTargetRef,
    });

    expect(sessionCommands.persistReaderState).not.toHaveBeenCalled();

    pendingRestoreTargetRef.current = null;

    act(() => {
      rerender(buildProps({
        chapterDataRevision: 2,
      }));
    });

    await waitFor(() => {
      expect(sessionCommands.persistReaderState).toHaveBeenLastCalledWith(expect.objectContaining({
        canonical: expect.objectContaining({
          chapterIndex: 0,
          blockIndex: 0,
          kind: 'text',
        }),
        hints: expect.objectContaining({
          pageIndex: 0,
          contentMode: 'paged',
        }),
      }));
    });

    act(() => {
      rerender(buildProps({
        currentChapter: createChapterContent(1, 2),
        sessionSnapshot: {
          chapterIndex: 0,
        },
      }));
    });

    expect(sessionCommands.persistReaderState).toHaveBeenCalledTimes(1);
  });
});
