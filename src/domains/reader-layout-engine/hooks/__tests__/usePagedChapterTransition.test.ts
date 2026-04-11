import type { ChapterChangeSource } from '@shared/contracts/reader';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePagedChapterTransition } from '../usePagedChapterTransition';

function setupHook(overrides: {
  chapterIndex?: number;
  isPagedMode?: boolean;
  isChapterNavigationReady?: boolean;
} = {}) {
  let chapterChangeSource: ChapterChangeSource = null;
  const onCommitChapterNavigation = vi.fn(() => true);
  const onReplayDirectionalNavigation = vi.fn();

  const initialProps = {
    chapterIndex: overrides.chapterIndex ?? 0,
    isPagedMode: overrides.isPagedMode ?? true,
    isChapterNavigationReady: overrides.isChapterNavigationReady ?? false,
  };

  const { result, rerender } = renderHook(
    (props: typeof initialProps) =>
      usePagedChapterTransition({
        isPagedMode: props.isPagedMode,
        chapterIndex: props.chapterIndex,
        isChapterNavigationReady: props.isChapterNavigationReady,
        getChapterChangeSource: () => chapterChangeSource,
        onCommitChapterNavigation,
        onReplayDirectionalNavigation,
      }),
    {
      initialProps,
    },
  );

  return {
    result,
    rerender,
    setChapterChangeSource: (nextSource: ChapterChangeSource) => {
      chapterChangeSource = nextSource;
    },
    onCommitChapterNavigation,
    onReplayDirectionalNavigation,
    baseProps: initialProps,
  };
}

describe('usePagedChapterTransition', () => {
  it('replays only the last queued directional intent after the target chapter becomes ready', () => {
    const {
      result,
      rerender,
      onCommitChapterNavigation,
      onReplayDirectionalNavigation,
      baseProps,
    } = setupHook();

    act(() => {
      result.current.requestChapterNavigation(1, 'start');
      result.current.requestDirectionalNavigation('next', true);
      result.current.requestDirectionalNavigation('prev', false);
      result.current.requestDirectionalNavigation('next', true);
    });

    expect(onCommitChapterNavigation).toHaveBeenCalledTimes(1);
    expect(onCommitChapterNavigation).toHaveBeenCalledWith(1, 'start');

    act(() => {
      rerender({
        ...baseProps,
        chapterIndex: 1,
        isChapterNavigationReady: true,
      });
    });

    expect(onReplayDirectionalNavigation).toHaveBeenCalledTimes(1);
    expect(onReplayDirectionalNavigation).toHaveBeenCalledWith('next', true);
  });

  it('lets a chapter intent overwrite a queued directional intent', () => {
    const {
      result,
      rerender,
      onCommitChapterNavigation,
      onReplayDirectionalNavigation,
      baseProps,
    } = setupHook();

    act(() => {
      result.current.requestChapterNavigation(1, 'start');
      result.current.requestDirectionalNavigation('next');
      result.current.requestChapterNavigation(2, 'end');
    });

    act(() => {
      rerender({
        ...baseProps,
        chapterIndex: 1,
        isChapterNavigationReady: true,
      });
    });

    expect(onReplayDirectionalNavigation).not.toHaveBeenCalled();
    expect(onCommitChapterNavigation).toHaveBeenCalledTimes(2);
    expect(onCommitChapterNavigation).toHaveBeenNthCalledWith(2, 2, 'end');
  });

  it('clears queued state when chapter changes come from scroll', () => {
    const {
      result,
      rerender,
      setChapterChangeSource,
      onReplayDirectionalNavigation,
      baseProps,
    } = setupHook();

    act(() => {
      result.current.requestChapterNavigation(1, 'start');
      result.current.requestDirectionalNavigation('next');
    });

    setChapterChangeSource('scroll');

    act(() => {
      rerender({
        ...baseProps,
        chapterIndex: 1,
        isChapterNavigationReady: false,
      });
    });

    act(() => {
      rerender({
        ...baseProps,
        chapterIndex: 1,
        isChapterNavigationReady: true,
      });
    });

    expect(onReplayDirectionalNavigation).not.toHaveBeenCalled();
  });

  it('clears queued state when leaving paged mode', () => {
    const { result, rerender, onReplayDirectionalNavigation, baseProps } = setupHook();

    act(() => {
      result.current.requestChapterNavigation(1, 'start');
      result.current.requestDirectionalNavigation('next');
    });

    act(() => {
      rerender({
        ...baseProps,
        isPagedMode: false,
      });
    });

    act(() => {
      rerender({
        ...baseProps,
        chapterIndex: 1,
        isChapterNavigationReady: true,
      });
    });

    expect(onReplayDirectionalNavigation).not.toHaveBeenCalled();
  });

  it('does not re-commit a queued chapter intent that resolves to the current chapter', () => {
    const { result, rerender, onCommitChapterNavigation, baseProps } = setupHook();

    act(() => {
      result.current.requestChapterNavigation(1, 'start');
      result.current.requestChapterNavigation(1, 'end');
    });

    act(() => {
      rerender({
        ...baseProps,
        chapterIndex: 1,
        isChapterNavigationReady: true,
      });
    });

    expect(onCommitChapterNavigation).toHaveBeenCalledTimes(1);
  });

  it('commits immediately outside paged mode', () => {
    const { result, onCommitChapterNavigation } = setupHook({ isPagedMode: false });

    act(() => {
      result.current.requestChapterNavigation(2, 'end');
    });

    expect(onCommitChapterNavigation).toHaveBeenCalledTimes(1);
    expect(onCommitChapterNavigation).toHaveBeenCalledWith(2, 'end');
  });

  it('returns true for immediate directional navigation outside paged mode', () => {
    const { result } = setupHook({ isPagedMode: false });

    let shouldProceed = false;
    act(() => {
      shouldProceed = result.current.requestDirectionalNavigation('prev');
    });

    expect(shouldProceed).toBe(true);
  });

  it('stores page target when replaying a queued chapter intent', () => {
    const { result, rerender, onCommitChapterNavigation, baseProps } = setupHook();

    act(() => {
      result.current.requestChapterNavigation(1, 'start');
      result.current.requestChapterNavigation(2, 'end');
    });

    act(() => {
      rerender({
        ...baseProps,
        chapterIndex: 1,
        isChapterNavigationReady: true,
      });
    });

    expect(onCommitChapterNavigation).toHaveBeenNthCalledWith(2, 2, 'end');
  });
});
