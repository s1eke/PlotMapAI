import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useReaderImageResourceMock = vi.hoisted(() => vi.fn());
const peekReaderImageDimensionsMock = vi.hoisted(() => vi.fn());
const preloadReaderImageResourcesMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../hooks/useReaderImageResource', () => ({
  useReaderImageResource: useReaderImageResourceMock,
}));

vi.mock('../../../utils/readerImageResourceCache', () => ({
  peekReaderImageDimensions: peekReaderImageDimensionsMock,
  preloadReaderImageResources: preloadReaderImageResourcesMock,
}));

import ReaderImageViewer from '../ReaderImageViewer';

const entries = [
  {
    blockIndex: 1,
    chapterIndex: 0,
    imageKey: 'cover',
    order: 0,
  },
  {
    blockIndex: 3,
    chapterIndex: 0,
    imageKey: 'map',
    order: 1,
  },
];

function renderViewer(overrides: Partial<React.ComponentProps<typeof ReaderImageViewer>> = {}) {
  return render(
    <ReaderImageViewer
      activeEntry={entries[0]}
      activeIndex={0}
      canNavigateNext
      canNavigatePrev={false}
      entries={entries}
      getOriginRect={() => new DOMRect(40, 80, 120, 90)}
      isIndexResolved
      isIndexLoading={false}
      isOpen
      novelId={1}
      onRequestClose={() => {}}
      onRequestNavigate={async () => false}
      {...overrides}
    />,
  );
}

describe('ReaderImageViewer', () => {
  beforeEach(() => {
    useReaderImageResourceMock.mockReturnValue('blob:reader-image');
    peekReaderImageDimensionsMock.mockReturnValue({
      aspectRatio: 2,
      height: 600,
      width: 1200,
    });
    preloadReaderImageResourcesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('closes on single click after a short delay and still supports Escape', async () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    renderViewer({ onRequestClose });

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    const surface = document.body.querySelector('[data-reader-image-surface]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();
    expect(surface).not.toBeNull();

    fireEvent.click(stage!, { clientX: 12, clientY: 12 });
    expect(onRequestClose).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(320);
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    fireEvent.click(surface!, { clientX: 320, clientY: 240 });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(320);
    expect(onRequestClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onRequestClose).toHaveBeenCalledTimes(3);
  });

  it('keeps double click zooming instead of closing the viewer', async () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    renderViewer({ onRequestClose });

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    const surface = document.body.querySelector('[data-reader-image-surface]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();
    expect(surface).not.toBeNull();

    fireEvent.click(stage!, { clientX: 12, clientY: 12 });
    fireEvent.click(stage!, { clientX: 12, clientY: 12 });
    fireEvent.doubleClick(stage!, { clientX: 12, clientY: 12 });
    await vi.runOnlyPendingTimersAsync();

    expect(onRequestClose).toHaveBeenCalledTimes(0);

    fireEvent.click(stage!, { clientX: 12, clientY: 12 });
    fireEvent.click(stage!, { clientX: 12, clientY: 12 });
    fireEvent.doubleClick(stage!, { clientX: 12, clientY: 12 });
    await vi.runOnlyPendingTimersAsync();

    expect(onRequestClose).toHaveBeenCalledTimes(0);
  });

  it('keeps touch double tap zooming instead of closing the viewer', async () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    renderViewer({ onRequestClose });

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    const surface = document.body.querySelector('[data-reader-image-surface]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();
    expect(surface).not.toBeNull();

    fireEvent.pointerDown(stage!, {
      clientX: 220,
      clientY: 160,
      pointerId: 7,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(stage!, {
      clientX: 220,
      clientY: 160,
      pointerId: 7,
      pointerType: 'touch',
    });
    fireEvent.click(stage!, { clientX: 220, clientY: 160 });

    fireEvent.pointerDown(stage!, {
      clientX: 222,
      clientY: 162,
      pointerId: 7,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(stage!, {
      clientX: 222,
      clientY: 162,
      pointerId: 7,
      pointerType: 'touch',
    });
    fireEvent.click(stage!, { clientX: 222, clientY: 162 });
    await vi.runOnlyPendingTimersAsync();

    expect(onRequestClose).toHaveBeenCalledTimes(0);
  });

  it('navigates to the next image on a quick swipe even when no pointermove event is emitted', async () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    const onRequestNavigate = vi.fn().mockResolvedValue(true);
    renderViewer({
      canNavigatePrev: true,
      onRequestClose,
      onRequestNavigate,
    });

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();

    fireEvent.pointerDown(stage!, {
      clientX: 280,
      clientY: 180,
      pointerId: 11,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(stage!, {
      clientX: 120,
      clientY: 184,
      pointerId: 11,
      pointerType: 'touch',
    });
    fireEvent.click(stage!, { clientX: 120, clientY: 184 });

    await vi.runOnlyPendingTimersAsync();

    expect(onRequestNavigate).toHaveBeenCalledWith('next');
    expect(onRequestClose).toHaveBeenCalledTimes(0);
  });

  it('switches the current surface to non-anchor mode as soon as swipe navigation is armed', async () => {
    let resolveNavigate: ((value: boolean) => void) | null = null;
    const onRequestNavigate = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveNavigate = resolve;
    }));
    renderViewer({
      canNavigatePrev: true,
      onRequestNavigate,
    });

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    const surface = document.body.querySelector('[data-reader-image-transition-mode]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(surface).toHaveAttribute('data-reader-image-transition-mode', 'anchor');

    await act(async () => {
      fireEvent.pointerDown(stage!, {
        clientX: 280,
        clientY: 180,
        pointerId: 15,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(stage!, {
        clientX: 120,
        clientY: 184,
        pointerId: 15,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).toHaveBeenCalledWith('next');
    expect(surface).toHaveAttribute('data-reader-image-transition-mode', 'none');

    await act(async () => {
      resolveNavigate?.(false);
      await Promise.resolve();
    });

    expect(surface).toHaveAttribute('data-reader-image-transition-mode', 'anchor');
  });

  it('closes after a touch drag dismisses the unzoomed image downward', async () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    renderViewer({ onRequestClose });

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();

    fireEvent.pointerDown(stage!, {
      clientX: 180,
      clientY: 160,
      pointerId: 31,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(stage!, {
      clientX: 194,
      clientY: 334,
      pointerId: 31,
      pointerType: 'touch',
    });

    await act(async () => {
      fireEvent.pointerUp(stage!, {
        clientX: 194,
        clientY: 334,
        pointerId: 31,
        pointerType: 'touch',
      });
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the viewer open when swipe navigation remounts the stage before the synthetic click arrives', async () => {
    vi.useFakeTimers();

    function StatefulViewer() {
      const [activeIndex, setActiveIndex] = useState(0);
      const [isOpen, setIsOpen] = useState(true);
      const activeEntry = entries[activeIndex] ?? null;

      return (
        <ReaderImageViewer
          activeEntry={activeEntry}
          activeIndex={activeIndex}
          canNavigateNext={activeIndex < entries.length - 1}
          canNavigatePrev={activeIndex > 0}
          entries={entries}
          getOriginRect={() => new DOMRect(40, 80, 120, 90)}
          isIndexResolved
          isIndexLoading={false}
          isOpen={isOpen}
          novelId={1}
          onRequestClose={() => {
            setIsOpen(false);
          }}
          onRequestNavigate={async (direction) => {
            if (direction !== 'next') {
              return false;
            }

            setActiveIndex(1);
            return true;
          }}
        />
      );
    }

    render(<StatefulViewer />);

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(stage!, {
        clientX: 280,
        clientY: 180,
        pointerId: 21,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(stage!, {
        clientX: 120,
        clientY: 184,
        pointerId: 21,
        pointerType: 'touch',
      });
    });

    const nextStage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    expect(nextStage).not.toBeNull();

    await act(async () => {
      fireEvent.click(nextStage!, { clientX: 120, clientY: 184 });
      await vi.advanceTimersByTimeAsync(320);
    });

    expect(screen.getByRole('dialog', { name: 'reader.imageViewer.title' })).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    const indexOverlay = document.body.querySelector('[data-reader-image-index]') as HTMLDivElement | null;
    expect(indexOverlay).not.toBeNull();
    expect(indexOverlay?.closest('[data-reader-image-transition-kind]')).toBeNull();
  });

  it('keeps swipe transition modes uniform when navigating away from the initially opened image', async () => {
    function StatefulViewer() {
      const [activeIndex, setActiveIndex] = useState(0);
      const activeEntry = entries[activeIndex] ?? null;

      return (
        <ReaderImageViewer
          activeEntry={activeEntry}
          activeIndex={activeIndex}
          canNavigateNext={activeIndex < entries.length - 1}
          canNavigatePrev={activeIndex > 0}
          entries={entries}
          getOriginRect={() => new DOMRect(40, 80, 120, 90)}
          isIndexResolved
          isIndexLoading={false}
          isOpen
          novelId={1}
          onRequestClose={() => {}}
          onRequestNavigate={async (direction) => {
            if (direction !== 'next') {
              return false;
            }

            setActiveIndex(1);
            return true;
          }}
        />
      );
    }

    render(<StatefulViewer />);

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();
    expect(document.body.querySelector('[data-reader-image-transition-mode="anchor"]')).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(stage!, {
        clientX: 280,
        clientY: 180,
        pointerId: 27,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(stage!, {
        clientX: 120,
        clientY: 184,
        pointerId: 27,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    const transitionModes = Array.from(
      document.body.querySelectorAll('[data-reader-image-transition-mode]'),
    ).map((element) => element.getAttribute('data-reader-image-transition-mode'));

    expect(transitionModes).toContain('none');
    expect(transitionModes).not.toContain('anchor');
  });

  it('covers the stage with the incoming slide layer so the previous image does not peek through', async () => {
    function StatefulViewer() {
      const [activeIndex, setActiveIndex] = useState(0);
      const activeEntry = entries[activeIndex] ?? null;

      return (
        <ReaderImageViewer
          activeEntry={activeEntry}
          activeIndex={activeIndex}
          canNavigateNext={activeIndex < entries.length - 1}
          canNavigatePrev={activeIndex > 0}
          entries={entries}
          getOriginRect={() => new DOMRect(40, 80, 120, 90)}
          isIndexResolved
          isIndexLoading={false}
          isOpen
          novelId={1}
          onRequestClose={() => {}}
          onRequestNavigate={async (direction) => {
            if (direction !== 'next') {
              return false;
            }

            setActiveIndex(1);
            return true;
          }}
        />
      );
    }

    render(<StatefulViewer />);

    const stage = document.body.querySelector('[data-reader-image-stage]') as HTMLDivElement | null;
    expect(stage).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(stage!, {
        clientX: 280,
        clientY: 180,
        pointerId: 29,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(stage!, {
        clientX: 120,
        clientY: 184,
        pointerId: 29,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    const slideLayer = document.body.querySelector('[data-reader-image-transition-kind="slide"]');
    expect(slideLayer).not.toBeNull();
    expect(slideLayer).toHaveClass('bg-black', 'z-[2]');
  });

  it('ignores rapid follow-up swipes until the current slide transition settles', async () => {
    const rapidEntries = [
      entries[0],
      entries[1],
      {
        blockIndex: 5,
        chapterIndex: 0,
        imageKey: 'scene',
        order: 2,
      },
    ];
    const onRequestNavigate = vi.fn();

    function StatefulViewer() {
      const [activeIndex, setActiveIndex] = useState(0);
      const activeEntry = rapidEntries[activeIndex] ?? null;

      return (
        <ReaderImageViewer
          activeEntry={activeEntry}
          activeIndex={activeIndex}
          canNavigateNext={activeIndex < rapidEntries.length - 1}
          canNavigatePrev={activeIndex > 0}
          entries={rapidEntries}
          getOriginRect={() => new DOMRect(40, 80, 120, 90)}
          isIndexResolved
          isIndexLoading={false}
          isOpen
          novelId={1}
          onRequestClose={() => {}}
          onRequestNavigate={async (direction) => {
            onRequestNavigate(direction);
            if (direction === 'next' && activeIndex < rapidEntries.length - 1) {
              setActiveIndex(activeIndex + 1);
              return true;
            }

            return false;
          }}
        />
      );
    }

    render(<StatefulViewer />);

    const initialStage = document.body.querySelector(
      '[data-reader-image-stage]',
    ) as HTMLDivElement | null;
    expect(initialStage).not.toBeNull();

    await act(async () => {
      fireEvent.pointerDown(initialStage!, {
        clientX: 280,
        clientY: 180,
        pointerId: 33,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(initialStage!, {
        clientX: 120,
        clientY: 184,
        pointerId: 33,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).toHaveBeenCalledTimes(1);
    const nextStage = document.body.querySelector(
      '[data-reader-image-stage]',
    ) as HTMLDivElement | null;
    expect(nextStage).not.toBeNull();
    expect(nextStage).toHaveAttribute('data-reader-image-navigation-pending', '');

    await act(async () => {
      fireEvent.pointerDown(nextStage!, {
        clientX: 280,
        clientY: 180,
        pointerId: 34,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(nextStage!, {
        clientX: 120,
        clientY: 184,
        pointerId: 34,
        pointerType: 'touch',
      });
      await Promise.resolve();
    });

    expect(onRequestNavigate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });
});
