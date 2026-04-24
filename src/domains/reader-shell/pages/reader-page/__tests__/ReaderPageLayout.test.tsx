import type { ComponentProps } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { AppErrorCode, createAppError } from '@shared/errors';

import ReaderPageLayout from '../ReaderPageLayout';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

type ReaderPageLayoutProps = ComponentProps<typeof ReaderPageLayout>;

const imageViewerProps: ReaderPageLayoutProps['imageViewerProps'] = {
  activeEntry: null,
  activeIndex: 0,
  canNavigateNext: false,
  canNavigatePrev: false,
  entries: [],
  getOriginRect: () => null,
  isIndexResolved: true,
  isIndexLoading: false,
  isOpen: false,
  novelId: 1,
  onRequestClose: () => undefined,
  onRequestNavigate: async () => false,
};

const sidebarProps: ReaderPageLayoutProps['sidebarProps'] = {
  chapters: [],
  currentIndex: 0,
  contentTextColor: 'text-reader',
  isSidebarOpen: false,
  sidebarBgClassName: 'bg-sidebar',
  onClose: () => undefined,
  onSelectChapter: () => undefined,
};

const topBarProps: ReaderPageLayoutProps['topBarProps'] = {
  exitHref: '/novel/1',
  readerTheme: 'paper',
  headerBgClassName: 'bg-page',
  textClassName: 'text-reader',
  isChromeVisible: true,
  isSidebarOpen: false,
  viewMode: 'original',
  onExit: () => undefined,
  onMobileBack: () => undefined,
  onToggleSidebar: () => undefined,
  onSetViewMode: () => undefined,
};

const viewportProps: ReaderPageLayoutProps['viewportProps'] = {
  contentRef: { current: null },
  isPagedMode: false,
  viewMode: 'original',
  renderableChapter: null,
  showLoadingOverlay: false,
  isRestoringPosition: false,
  onBlockedInteraction: () => undefined,
  onContentClick: () => undefined,
  onContentScroll: () => undefined,
  emptyHref: '/novel/1',
  emptyLabel: 'empty',
  goBackLabel: 'back',
};

function renderLayout(overrides: Partial<ComponentProps<typeof ReaderPageLayout>> = {}) {
  return render(
    <MemoryRouter>
      <ReaderPageLayout
        backHref="/novel/1"
        imageViewerProps={imageViewerProps}
        pageBgClassName="bg-page"
        readerError={createAppError({
          code: AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING,
          kind: 'not-found',
          source: 'reader',
          userMessageKey: 'errors.CHAPTER_STRUCTURED_CONTENT_MISSING',
        })}
        reparseRecovery={{
          accept: '.epub',
          actionError: null,
          actionMessage: null,
          isReparsing: false,
          onFilesSelected: vi.fn(),
          progress: null,
          visible: true,
        }}
        sidebarProps={sidebarProps}
        topBarProps={topBarProps}
        viewportProps={viewportProps}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe('ReaderPageLayout', () => {
  it('shows reparse recovery actions only for missing structured content', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

    renderLayout();

    expect(screen.getByText('errors.CHAPTER_STRUCTURED_CONTENT_MISSING')).toBeInTheDocument();
    expect(screen.getByText('reader.reparse.description')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.actions.retry' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'reader.reparse.action' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'reader.goBack' })).toHaveAttribute('href', '/novel/1');
  });

  it('falls back to the generic retry state for other reader errors', () => {
    renderLayout({
      readerError: createAppError({
        code: AppErrorCode.CHAPTER_NOT_FOUND,
        kind: 'not-found',
        source: 'reader',
        userMessageKey: 'errors.CHAPTER_NOT_FOUND',
      }),
      reparseRecovery: {
        accept: '.epub',
        actionError: null,
        actionMessage: null,
        isReparsing: false,
        onFilesSelected: vi.fn(),
        progress: null,
        visible: false,
      },
    });

    expect(screen.getByRole('button', { name: 'common.actions.retry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'reader.reparse.action' })).not.toBeInTheDocument();
    expect(screen.queryByText('reader.reparse.description')).not.toBeInTheDocument();
  });
});
