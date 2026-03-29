import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderSidebar from '../ReaderSidebar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const chapters = [
  { index: 0, title: 'Chapter 1', wordCount: 100 },
  { index: 1, title: 'Chapter 2', wordCount: 120 },
];

interface SidebarHarnessProps {
  chapters?: typeof chapters;
  initialOpen?: boolean;
  onSelect?: (chapterIndex: number) => void;
}

function SidebarHarness({
  chapters: sidebarChapters = chapters,
  initialOpen = true,
  onSelect = () => {},
}: SidebarHarnessProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialOpen);

  return (
    <>
      <button type="button" onClick={() => setIsSidebarOpen(true)}>
        Open contents
      </button>
      <ReaderSidebar
        chapters={sidebarChapters}
        currentIndex={0}
        contentTextColor="text-text-primary"
        isSidebarOpen={isSidebarOpen}
        sidebarBgClassName="bg-bg-secondary"
        onClose={() => setIsSidebarOpen(false)}
        onSelectChapter={(chapterIndex) => {
          onSelect(chapterIndex);
          setIsSidebarOpen(false);
        }}
      />
    </>
  );
}

describe('ReaderSidebar', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the mobile table of contents in a bottom sheet and closes from the backdrop', async () => {
    const { container } = render(<SidebarHarness />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-root"]')).toHaveClass('bottom-[calc(76px+env(safe-area-inset-bottom,0px))]');

    fireEvent.pointerDown(container.querySelector('[data-slot="sheet-backdrop"]') as HTMLDivElement);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open contents' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('closes the mobile table of contents when the drag handle is pulled down', async () => {
    const { container } = render(<SidebarHarness />);
    const dragHandle = container.querySelector('[data-slot="sheet-handle-area"]');

    expect(dragHandle).toBeInstanceOf(HTMLDivElement);

    fireEvent.pointerDown(dragHandle as HTMLDivElement, { pointerId: 1, clientY: 120 });
    fireEvent.pointerMove(dragHandle as HTMLDivElement, { pointerId: 1, clientY: 280 });
    fireEvent.pointerUp(dragHandle as HTMLDivElement, { pointerId: 1, clientY: 280 });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('scrolls the active chapter into view and closes after a chapter is selected', async () => {
    const onSelect = vi.fn();

    render(<SidebarHarness onSelect={onSelect} />);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Chapter 2/ }));

    expect(onSelect).toHaveBeenCalledWith(1);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps the sheet content scrollable for long chapter lists', () => {
    const manyChapters = Array.from({ length: 40 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      wordCount: 100 + index,
    }));

    render(<SidebarHarness chapters={manyChapters} />);

    const sheetContent = document.querySelector('[data-slot="sheet-content"]');

    expect(sheetContent).toBeInstanceOf(HTMLDivElement);
    expect(sheetContent).toHaveClass('overflow-y-auto');
    expect(sheetContent).not.toHaveClass('overflow-hidden');

    Object.defineProperty(sheetContent as HTMLDivElement, 'clientHeight', {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(sheetContent as HTMLDivElement, 'scrollHeight', {
      configurable: true,
      value: 1600,
    });

    act(() => {
      (sheetContent as HTMLDivElement).scrollTop = 320;
      fireEvent.scroll(sheetContent as HTMLDivElement);
    });

    expect((sheetContent as HTMLDivElement).scrollTop).toBe(320);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Chapter 40/ })).toBeInTheDocument();
  });
});
