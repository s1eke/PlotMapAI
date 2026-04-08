import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';
import type { ReaderImageViewerViewportSize } from '../../utils/readerImageViewerTypes';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { motion, useMotionValue } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const peekReaderImageDimensionsMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/readerImageResourceCache', () => ({
  peekReaderImageDimensions: peekReaderImageDimensionsMock,
}));

import { useReaderImageViewerGesture } from '../useReaderImageViewerGesture';

const entries: ReaderImageGalleryEntry[] = [
  {
    blockIndex: 0,
    chapterIndex: 0,
    imageKey: 'cover',
    order: 0,
  },
  {
    blockIndex: 1,
    chapterIndex: 0,
    imageKey: 'map',
    order: 1,
  },
];

interface GestureHarnessProps {
  activeEntry?: ReaderImageGalleryEntry;
  activeIndex?: number;
  canNavigateNext?: boolean;
  canNavigatePrev?: boolean;
  consumeDeferredStageClick?: () => boolean;
  entries?: ReaderImageGalleryEntry[];
  hasImageResource?: boolean;
  isNavigationTransitionPending?: boolean;
  novelId?: number;
  onClearNavigationTransition?: () => void;
  onPrepareNavigationTransition?: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose?: () => void;
  onRequestDismissClose?: () => void;
  onRequestNavigate?: (direction: 'next' | 'prev') => Promise<boolean>;
  suppressDeferredStageClick?: () => void;
  viewportSize?: ReaderImageViewerViewportSize;
}

function renderHarness({
  activeEntry = entries[0],
  activeIndex = 0,
  canNavigateNext = true,
  canNavigatePrev = false,
  consumeDeferredStageClick = () => false,
  entries: harnessEntries = entries,
  hasImageResource = true,
  isNavigationTransitionPending = false,
  novelId = 1,
  onClearNavigationTransition = () => undefined,
  onPrepareNavigationTransition = () => undefined,
  onRequestClose = () => undefined,
  onRequestDismissClose = () => undefined,
  onRequestNavigate = async () => false,
  suppressDeferredStageClick = () => undefined,
  viewportSize = { height: 640, width: 360 },
}: GestureHarnessProps = {}) {
  function GestureHarness() {
    const dismissProgress = useMotionValue(0);
    const gesture = useReaderImageViewerGesture({
      activeEntry,
      activeIndex,
      canNavigateNext,
      canNavigatePrev,
      consumeDeferredStageClick,
      dismissProgress,
      entries: harnessEntries,
      hasImageResource,
      isNavigationTransitionPending,
      novelId,
      onClearNavigationTransition,
      onPrepareNavigationTransition,
      onRequestClose,
      onRequestDismissClose,
      onRequestNavigate,
      suppressDeferredStageClick,
      viewportSize,
    });

    return (
      <div
        data-testid="stage"
        onClick={gesture.handleStageClick}
        onDoubleClick={gesture.handleStageDoubleClick}
        onPointerCancel={gesture.handlePointerCancel}
        onPointerDown={gesture.handlePointerDown}
        onPointerMove={gesture.handlePointerMove}
        onPointerUp={gesture.handlePointerUp}
        onWheel={gesture.handleStageWheel}
      >
        <motion.div
          data-testid="transform-layer"
          style={{
            opacity: gesture.surfaceOpacity,
            scale: gesture.scaleMotionValue,
            x: gesture.translateXMotionValue,
            y: gesture.translateYMotionValue,
          }}
        />
      </div>
    );
  }

  const renderResult = render(<GestureHarness />);
  return {
    ...renderResult,
    stage: screen.getByTestId('stage'),
    transformLayer: screen.getByTestId('transform-layer'),
  };
}

describe('useReaderImageViewerGesture', () => {
  beforeEach(() => {
    peekReaderImageDimensionsMock.mockReturnValue({
      aspectRatio: 2,
      height: 400,
      width: 800,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('closes when a pinch gesture ends below the close threshold', async () => {
    const onRequestClose = vi.fn();
    const { stage } = renderHarness({ onRequestClose });

    fireEvent.pointerDown(stage, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerDown(stage, {
      clientX: 200,
      clientY: 100,
      pointerId: 2,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(stage, {
      clientX: 180,
      clientY: 100,
      pointerId: 2,
      pointerType: 'touch',
    });

    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 180,
        clientY: 100,
        pointerId: 2,
        pointerType: 'touch',
      });
    });

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('allows zoomed swipe navigation when swiping from a zoomed image', async () => {
    const onRequestNavigate = vi.fn().mockResolvedValue(true);
    const { stage } = renderHarness({
      canNavigatePrev: true,
      onRequestNavigate,
    });

    await act(async () => {
      fireEvent.doubleClick(stage, { clientX: 180, clientY: 320 });
    });

    await act(async () => {
      fireEvent.pointerDown(stage, {
        clientX: 220,
        clientY: 320,
        pointerId: 12,
        pointerType: 'touch',
      });
      fireEvent.pointerMove(stage, {
        clientX: 20,
        clientY: 320,
        pointerId: 12,
        pointerType: 'touch',
      });
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 20,
        clientY: 320,
        pointerId: 12,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).toHaveBeenCalledTimes(1);
    expect(onRequestNavigate).toHaveBeenCalledWith('next');
  });

  it('re-clamps the transform when navigation fails at the edge', async () => {
    const onClearNavigationTransition = vi.fn();
    const onRequestNavigate = vi.fn().mockResolvedValue(false);
    const { stage } = renderHarness({
      onClearNavigationTransition,
      onRequestNavigate,
    });

    await act(async () => {
      fireEvent.doubleClick(stage, { clientX: 180, clientY: 320 });
    });

    await act(async () => {
      fireEvent.pointerDown(stage, {
        clientX: 220,
        clientY: 320,
        pointerId: 20,
        pointerType: 'touch',
      });
      fireEvent.pointerMove(stage, {
        clientX: 20,
        clientY: 320,
        pointerId: 20,
        pointerType: 'touch',
      });
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 20,
        clientY: 320,
        pointerId: 20,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).toHaveBeenCalledWith('next');
    expect(onClearNavigationTransition).toHaveBeenCalledTimes(1);
  });

  it('ignores follow-up swipe navigation while a slide transition is still pending', async () => {
    const onRequestNavigate = vi.fn().mockResolvedValue(true);
    const { stage } = renderHarness({
      canNavigatePrev: true,
      isNavigationTransitionPending: true,
      onRequestNavigate,
    });

    fireEvent.pointerDown(stage, {
      clientX: 280,
      clientY: 180,
      pointerId: 24,
      pointerType: 'touch',
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 120,
        clientY: 184,
        pointerId: 24,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).not.toHaveBeenCalled();
  });

  it('suppresses delayed close when touch double tap promotes to zoom', async () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    const { stage } = renderHarness({ onRequestClose });

    fireEvent.pointerDown(stage, {
      clientX: 220,
      clientY: 160,
      pointerId: 30,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(stage, {
      clientX: 220,
      clientY: 160,
      pointerId: 30,
      pointerType: 'touch',
    });
    fireEvent.click(stage, { clientX: 220, clientY: 160 });

    fireEvent.pointerDown(stage, {
      clientX: 222,
      clientY: 162,
      pointerId: 30,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(stage, {
      clientX: 222,
      clientY: 162,
      pointerId: 30,
      pointerType: 'touch',
    });
    fireEvent.click(stage, { clientX: 222, clientY: 162 });

    await vi.runOnlyPendingTimersAsync();

    expect(onRequestClose).toHaveBeenCalledTimes(0);
  });

  it('closes when an unzoomed downward drag exceeds the dismiss threshold', async () => {
    vi.useFakeTimers();
    const onRequestDismissClose = vi.fn();
    const onRequestNavigate = vi.fn().mockResolvedValue(true);
    const { stage } = renderHarness({
      onRequestDismissClose,
      onRequestNavigate,
    });

    fireEvent.pointerDown(stage, {
      clientX: 180,
      clientY: 160,
      pointerId: 41,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(stage, {
      clientX: 196,
      clientY: 320,
      pointerId: 41,
      pointerType: 'touch',
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 196,
        clientY: 320,
        pointerId: 41,
        pointerType: 'touch',
      });
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(onRequestDismissClose).toHaveBeenCalledTimes(1);
    expect(onRequestNavigate).not.toHaveBeenCalled();
  });

  it('closes on a quick downward flick even when distance is short', async () => {
    vi.useFakeTimers();
    const onRequestDismissClose = vi.fn();
    const { stage } = renderHarness({ onRequestDismissClose });

    fireEvent.pointerDown(stage, {
      clientX: 180,
      clientY: 180,
      pointerId: 42,
      pointerType: 'touch',
    });
    await vi.advanceTimersByTimeAsync(16);
    fireEvent.pointerMove(stage, {
      clientX: 184,
      clientY: 250,
      pointerId: 42,
      pointerType: 'touch',
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
      fireEvent.pointerUp(stage, {
        clientX: 184,
        clientY: 274,
        pointerId: 42,
        pointerType: 'touch',
      });
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(onRequestDismissClose).toHaveBeenCalledTimes(1);
  });

  it('rebounds to center when the unzoomed downward drag is too short', async () => {
    const onRequestDismissClose = vi.fn();
    const { stage } = renderHarness({ onRequestDismissClose });

    fireEvent.pointerDown(stage, {
      clientX: 180,
      clientY: 180,
      pointerId: 43,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(stage, {
      clientX: 186,
      clientY: 248,
      pointerId: 43,
      pointerType: 'touch',
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 186,
        clientY: 248,
        pointerId: 43,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestDismissClose).not.toHaveBeenCalled();
  });

  it('treats a horizontal-dominant diagonal drag as navigation instead of dismiss', async () => {
    const onRequestDismissClose = vi.fn();
    const onRequestNavigate = vi.fn().mockResolvedValue(true);
    const { stage } = renderHarness({
      onRequestDismissClose,
      onRequestNavigate,
    });

    fireEvent.pointerDown(stage, {
      clientX: 280,
      clientY: 180,
      pointerId: 44,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(stage, {
      clientX: 120,
      clientY: 250,
      pointerId: 44,
      pointerType: 'touch',
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 120,
        clientY: 250,
        pointerId: 44,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).toHaveBeenCalledWith('next');
    expect(onRequestDismissClose).not.toHaveBeenCalled();
  });

  it('keeps zoomed vertical drags from triggering drag dismiss', async () => {
    const onRequestDismissClose = vi.fn();
    const { stage } = renderHarness({ onRequestDismissClose });

    await act(async () => {
      fireEvent.doubleClick(stage, { clientX: 180, clientY: 320 });
    });

    fireEvent.pointerDown(stage, {
      clientX: 180,
      clientY: 220,
      pointerId: 45,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(stage, {
      clientX: 180,
      clientY: 360,
      pointerId: 45,
      pointerType: 'touch',
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 180,
        clientY: 360,
        pointerId: 45,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestDismissClose).not.toHaveBeenCalled();
  });
});
