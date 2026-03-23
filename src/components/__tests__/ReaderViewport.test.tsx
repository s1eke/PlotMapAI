import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChapterContent } from '../../api/reader';
import ReaderViewport from '../reader/ReaderViewport';

vi.mock('../reader/PagedReaderContent', () => ({
  default: () => <div>paged-content</div>,
}));

vi.mock('../reader/ScrollReaderContent', () => ({
  default: () => <div>scroll-content</div>,
}));

vi.mock('../reader/SummaryReaderContent', () => ({
  default: () => <div>summary-content</div>,
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
        onContentClick={() => {}}
        onContentScroll={() => {}}
        emptyHref="/novel/1"
        emptyLabel="No chapters"
        goBackLabel="Go back"
        pagedContentProps={{
          chapter,
          novelId: 1,
          pageIndex: 0,
          pageCount: 1,
          pagedViewportRef: { current: null },
          pagedContentRef: { current: null },
          fontSize: 18,
          lineSpacing: 1.8,
          paragraphSpacing: 24,
          readerTheme: 'auto',
          textClassName: '',
          headerBgClassName: '',
          fitsTwoColumns: false,
          twoColumnWidth: undefined,
          twoColumnGap: 48,
        }}
        scrollContentProps={{
          chapters: [{ index: 0, chapter }],
          novelId: 1,
          fontSize: 18,
          lineSpacing: 1.8,
          paragraphSpacing: 24,
          readerTheme: 'auto',
          textClassName: '',
          headerBgClassName: '',
          onChapterElement: () => {},
        }}
        summaryContentProps={{
          chapter,
          novelId: 1,
          analysis: null,
          job: null,
          isLoading: false,
          isAnalyzingChapter: false,
          onAnalyzeChapter: () => {},
          readerTheme: 'auto',
          textClassName: '',
          headerBgClassName: '',
        }}
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
          scrollContentProps={{
            chapters: [{ index: 0, chapter }],
            novelId: 1,
            fontSize: 18,
            lineSpacing: 1.8,
            paragraphSpacing: 24,
            readerTheme: 'auto',
            textClassName: '',
            headerBgClassName: '',
            onChapterElement: () => {},
          }}
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
          summaryContentProps={{
            chapter,
            novelId: 1,
            analysis: null,
            job: null,
            isLoading: false,
            isAnalyzingChapter: false,
            onAnalyzeChapter: () => {},
            readerTheme: 'auto',
            textClassName: '',
            headerBgClassName: '',
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('summary-content')).toBeInTheDocument();
  });
});
