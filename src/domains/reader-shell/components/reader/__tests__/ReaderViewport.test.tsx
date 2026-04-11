import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChapterContent } from '@shared/contracts/reader';
import ReaderViewport from '../ReaderViewport';

vi.mock('@domains/reader-layout-engine', () => ({
  PagedReaderContent: () => <div>paged-content</div>,
  ScrollReaderContent: () => <div>scroll-content</div>,
  SummaryReaderContent: () => <div>summary-content</div>,
}));

const chapter: ChapterContent = {
  index: 0,
  title: 'Chapter 1',
  content: 'Chapter 1 content',
  wordCount: 100,
  totalChapters: 1,
  hasPrev: false,
  hasNext: false,
};

type ReaderViewportProps = ComponentProps<typeof ReaderViewport>;

const pagedContentProps: NonNullable<ReaderViewportProps['pagedContentProps']> = {
  chapter,
  headerBgClassName: 'bg-surface',
  novelId: 1,
  pageIndex: 0,
  pageTurnDirection: 'next',
  pageTurnMode: 'slide',
  pageTurnToken: 0,
  readerTheme: 'auto',
  textClassName: 'text-base',
};

const scrollContentProps: NonNullable<ReaderViewportProps['scrollContentProps']> = {
  chapters: [],
  headerBgClassName: 'bg-surface',
  novelId: 1,
  onChapterElement: () => {},
  readerTheme: 'auto',
  textClassName: 'text-base',
};

const summaryContentProps: NonNullable<ReaderViewportProps['summaryContentProps']> = {
  analysisPanel: null,
  chapter,
  headerBgClassName: 'bg-surface',
  readerTheme: 'auto',
  textClassName: 'text-base',
};

function renderViewport(overrides: Partial<React.ComponentProps<typeof ReaderViewport>> = {}) {
  return render(
    <MemoryRouter>
      <ReaderViewport
        contentRef={{ current: null }}
        isPagedMode={false}
        viewMode="original"
        renderableChapter={null}
        showLoadingOverlay={false}
        isRestoringPosition={false}
        onBlockedInteraction={() => {}}
        onContentClick={() => {}}
        onContentScroll={() => {}}
        emptyHref="/novel/1"
        emptyLabel="No chapters"
        goBackLabel="Go back"
        pagedContentProps={pagedContentProps}
        scrollContentProps={scrollContentProps}
        summaryContentProps={summaryContentProps}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('ReaderViewport', () => {
  it('renders the empty state when there is no chapter and no loading overlay', () => {
    renderViewport();

    expect(screen.getByText('No chapters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go back' })).toHaveAttribute('href', '/novel/1');
  });

  it('renders the loading overlay instead of the empty state', () => {
    renderViewport({ showLoadingOverlay: true });

    expect(screen.queryByText('No chapters')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading reader content' })).toBeInTheDocument();
  });

  it('switches between paged, scroll, and summary content branches', () => {
    const { rerender } = renderViewport({ renderableChapter: chapter, isPagedMode: true });

    expect(screen.getByText('paged-content')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ReaderViewport
          contentRef={{ current: null }}
          isPagedMode={false}
          viewMode="original"
          renderableChapter={chapter}
          showLoadingOverlay={false}
          isRestoringPosition={false}
          onContentClick={() => {}}
          onContentScroll={() => {}}
          emptyHref="/novel/1"
          emptyLabel="No chapters"
          goBackLabel="Go back"
          scrollContentProps={scrollContentProps}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('scroll-content')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ReaderViewport
          contentRef={{ current: null }}
          isPagedMode={false}
          viewMode="summary"
          renderableChapter={chapter}
          showLoadingOverlay={false}
          isRestoringPosition={false}
          onContentClick={() => {}}
          onContentScroll={() => {}}
          emptyHref="/novel/1"
          emptyLabel="No chapters"
          goBackLabel="Go back"
          summaryContentProps={summaryContentProps}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('summary-content')).toBeInTheDocument();
  });

  it('locks scroll-mode overflow when interaction is locked', () => {
    const { container } = renderViewport({
      renderableChapter: chapter,
      isPagedMode: false,
      interactionLocked: true,
    });

    expect(container.firstChild).toHaveClass('overflow-hidden');
    expect(container.firstChild).not.toHaveClass('overflow-y-auto');
  });

  it('dismisses blocked wheel interactions while the menu is visible', () => {
    const onBlockedInteraction = vi.fn();
    const { container } = renderViewport({
      renderableChapter: chapter,
      isPagedMode: false,
      interactionLocked: true,
      onBlockedInteraction,
    });

    fireEvent.wheel(container.firstChild as HTMLElement, { deltaY: 120 });

    expect(onBlockedInteraction).toHaveBeenCalledTimes(1);
  });

  it('dismisses blocked touchmove interactions while the menu is visible', () => {
    const onBlockedInteraction = vi.fn();
    const { container } = renderViewport({
      renderableChapter: chapter,
      isPagedMode: false,
      interactionLocked: true,
      onBlockedInteraction,
    });

    fireEvent.touchMove(container.firstChild as HTMLElement);

    expect(onBlockedInteraction).toHaveBeenCalledTimes(1);
  });

  it('dismisses blocked paged drags before they can turn the page', () => {
    const onBlockedInteraction = vi.fn();
    const { container } = renderViewport({
      renderableChapter: chapter,
      isPagedMode: true,
      interactionLocked: true,
      onBlockedInteraction,
    });

    fireEvent.pointerMove(container.firstChild as HTMLElement, {
      buttons: 1,
      clientX: 160,
      clientY: 40,
    });

    expect(onBlockedInteraction).toHaveBeenCalledTimes(1);
  });
});
