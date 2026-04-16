import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { analysisService } from '@domains/analysis';
import { chapterRichContentRepository } from '@domains/book-content';
import { novelRepository, useNovelCoverResource } from '@domains/library';
import type { AnalysisStatusResponse } from '@shared/contracts';

import {
  pauseNovelAnalysis,
  restartNovelAnalysis,
  resumeNovelAnalysis,
  startNovelAnalysis,
} from '@application/use-cases/analysis';
import { deleteNovelAndCleanupArtifacts } from '@application/use-cases/library';

import BookDetailPage from '../book-detail';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@application/use-cases/analysis', () => ({
  pauseNovelAnalysis: vi.fn(),
  restartNovelAnalysis: vi.fn(),
  resumeNovelAnalysis: vi.fn(),
  startNovelAnalysis: vi.fn(),
}));

vi.mock('@application/use-cases/library', async () => {
  const actual = await vi.importActual<typeof import('@application/use-cases/library')>('@application/use-cases/library');
  return {
    ...actual,
    deleteNovelAndCleanupArtifacts: vi.fn(),
  };
});

vi.mock('@domains/analysis', () => ({
  analysisService: {
    getStatus: vi.fn(),
  },
}));

vi.mock('@domains/book-content', () => ({
  chapterRichContentRepository: {
    listNovelChapterRichContents: vi.fn(),
  },
}));

vi.mock('@domains/library', () => ({
  BookDetailActionButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  CharacterShareChart: () => <div data-testid="character-share-chart" />,
  PRIMARY_DETAIL_ACTION_CLASS: 'primary-detail-action',
  TxtCover: ({ title }: { title: string }) => <div data-testid="txt-cover">{title}</div>,
  useNovelCoverResource: vi.fn(),
  novelRepository: {
    get: vi.fn(),
  },
}));

const baseNovel = {
  author: 'Test Author',
  chapterCount: 6,
  createdAt: new Date().toISOString(),
  description: 'A test novel',
  fileType: 'txt',
  hasCover: false,
  id: 1,
  originalEncoding: 'utf-8',
  originalFilename: 'test.txt',
  tags: [],
  title: 'Mock Novel',
  totalWords: 1000,
};

function createStatusResponse(
  overrides: Partial<AnalysisStatusResponse['job']> = {},
): AnalysisStatusResponse {
  return {
    chunks: [],
    job: {
      analysisComplete: false,
      analyzedChapters: 0,
      canPause: false,
      canRestart: false,
      canResume: false,
      canStart: true,
      completedAt: null,
      completedChunks: 0,
      currentChunk: null,
      currentChunkIndex: 0,
      currentStage: 'idle',
      lastError: '',
      lastHeartbeat: null,
      pauseRequested: false,
      progressPercent: 0,
      startedAt: null,
      status: 'idle',
      totalChapters: 0,
      totalChunks: 0,
      updatedAt: null,
      ...overrides,
    },
    overview: null,
  };
}

function renderPage(initialEntry = '/novel/1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/novel/:id" element={<BookDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('application BookDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    vi.mocked(novelRepository.get).mockResolvedValue(baseNovel);
    vi.mocked(chapterRichContentRepository.listNovelChapterRichContents).mockResolvedValue([]);
    vi.mocked(useNovelCoverResource).mockReturnValue('blob:cover');
    vi.mocked(analysisService.getStatus).mockResolvedValue(createStatusResponse());
    vi.mocked(startNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canStart: false, currentStage: 'chapters', status: 'running' }),
    );
    vi.mocked(pauseNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canStart: false, currentStage: 'chapters', status: 'pausing' }),
    );
    vi.mocked(resumeNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canStart: false, currentStage: 'chapters', status: 'running' }),
    );
    vi.mocked(restartNovelAnalysis).mockResolvedValue(
      createStatusResponse({ canPause: true, canStart: false, currentStage: 'chapters', status: 'running' }),
    );
    vi.mocked(deleteNovelAndCleanupArtifacts).mockResolvedValue({ message: 'Novel deleted' });
  });

  it('starts analysis through the application use-case', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mock Novel', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('bookDetail.contentFormat')).not.toBeInTheDocument();
    expect(screen.queryByText('bookDetail.contentVersion')).not.toBeInTheDocument();
    expect(screen.queryByText('bookDetail.importFormatVersion')).not.toBeInTheDocument();
    expect(screen.queryByText('bookDetail.lastParsedAt')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'bookDetail.startAnalysis' }));

    expect(startNovelAnalysis).toHaveBeenCalledWith(1);
    expect(await screen.findByText('bookDetail.analysisActionStarted')).toBeInTheDocument();
  });

  it('pauses analysis through the application use-case', async () => {
    vi.mocked(analysisService.getStatus)
      .mockResolvedValueOnce(
        createStatusResponse({
          analyzedChapters: 3,
          canPause: true,
          canStart: false,
          currentStage: 'chapters',
          status: 'running',
          totalChapters: 6,
          totalChunks: 2,
        }),
      );
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByRole('button', { name: 'bookDetail.pauseAnalysis' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'bookDetail.pauseAnalysis' }));
    expect(pauseNovelAnalysis).toHaveBeenCalledWith(1);
  });

  it('resumes analysis through the application use-case', async () => {
    vi.mocked(analysisService.getStatus).mockResolvedValueOnce(
      createStatusResponse({
        analyzedChapters: 3,
        canRestart: true,
        canResume: true,
        canStart: false,
        currentStage: 'chapters',
        status: 'paused',
        totalChapters: 6,
        totalChunks: 2,
      }),
    );
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByRole('button', { name: 'bookDetail.resumeAnalysis' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'bookDetail.resumeAnalysis' }));
    expect(resumeNovelAnalysis).toHaveBeenCalledWith(1);
  });

  it('deletes the novel through the cleanup use-case', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mock Novel', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'bookDetail.deleteBook' }));
    await user.click(screen.getByRole('button', { name: 'common.actions.delete' }));

    await waitFor(() => {
      expect(deleteNovelAndCleanupArtifacts).toHaveBeenCalledWith(1);
    });
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });
});
