import type { ReaderImageGalleryEntry } from '../../utils/readerImageGallery';
import type { ReaderImageViewerViewportSize } from '../../utils/readerImageViewerTypes';

import { act, fireEvent, render, screen } from '@testing-library/react';
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
  novelId?: number;
  onClearNavigationTransition?: () => void;
  onPrepareNavigationTransition?: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose?: () => void;
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
  novelId = 1,
  onClearNavigationTransition = () => undefined,
  onPrepareNavigationTransition = () => undefined,
  onRequestClose = () => undefined,
  onRequestNavigate = async () => false,
  suppressDeferredStageClick = () => undefined,
  viewportSize = { height: 640, width: 360 },
}: GestureHarnessProps = {}) {
  function GestureHarness() {
    const gesture = useReaderImageViewerGesture({
      activeEntry,
      activeIndex,
      canNavigateNext,
      canNavigatePrev,
      consumeDeferredStageClick,
      entries: harnessEntries,
      hasImageResource,
      novelId,
      onClearNavigationTransition,
      onPrepareNavigationTransition,
      onRequestClose,
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
        <div
          data-testid="transform-layer"
          style={{
            transform: `translate3d(${gesture.transformState.translateX}px, ${gesture.transformState.translateY}px, 0) scale(${gesture.transformState.scale})`,
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

  it('allows zoomed swipe navigation only after the image reaches the edge', async () => {
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
        pointerId: 11,
        pointerType: 'touch',
      });
      fireEvent.pointerMove(stage, {
        clientX: 130,
        clientY: 320,
        pointerId: 11,
        pointerType: 'touch',
      });
    });
    await act(async () => {
      fireEvent.pointerUp(stage, {
        clientX: 130,
        clientY: 320,
        pointerId: 11,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).toHaveBeenCalledTimes(0);

    await act(async () => {
      fireEvent.pointerDown(stage, {
        clientX: 130,
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
    vi.useFakeTimers();
    const onClearNavigationTransition = vi.fn();
    const onRequestNavigate = vi.fn().mockResolvedValue(false);
    const { stage, transformLayer } = renderHarness({
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
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onRequestNavigate).toHaveBeenCalledWith('next');
    expect(onClearNavigationTransition).toHaveBeenCalledTimes(1);
    expect(transformLayer).toHaveStyle({
      transform: 'translate3d(-156px, 0px, 0) scale(2)',
    });
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
});
