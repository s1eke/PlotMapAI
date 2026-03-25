import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BookDetailPage from '../BookDetailPage';
import { analysisApi } from '../../api/analysis';
import type { AnalysisChunkStatus, AnalysisStatusResponse } from '../../api/analysis';
import { novelsApi } from '../../api/novels';

const i18nMock = vi.hoisted(() => ({
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock('../../api/novels', () => ({
  novelsApi: {
    get: vi.fn(),
    getCoverUrl: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../api/analysis', () => ({
  analysisApi: {
    getStatus: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    restart: vi.fn(),
  },
}));

vi.mock('../../components/TxtCover', () => ({
  default: ({ title }: { title: string }) => <div data-testid="txt-cover">{title}</div>,
}));

const baseNovel = {
  id: 1,
  title: 'Mock Novel',
  author: 'Test Author',
  description: 'A test novel',
  tags: [],
  fileType: 'txt',
  hasCover: false,
  originalFilename: 'test.txt',
  originalEncoding: 'utf-8',
  totalWords: 1000,
  chapterCount: 6,
  createdAt: new Date().toISOString(),
};

function createStatusResponse(
  overrides: Partial<AnalysisStatusResponse['job']> = {},
): AnalysisStatusResponse {
  return {
    job: {
      status: 'idle',
      currentStage: 'idle',
      analysisComplete: false,
      totalChapters: 0,
      analyzedChapters: 0,
      totalChunks: 0,
      completedChunks: 0,
      currentChunkIndex: 0,
      progressPercent: 0,
      pauseRequested: false,
      lastError: '',
      startedAt: null,
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: null,
      currentChunk: null as AnalysisChunkStatus | null,
      canStart: true,
      canPause: false,
      canResume: false,
      canRestart: false,
      ...overrides,
    },
    overview: null,
    chunks: [],
  };
}

function renderPage(initialEntry: string = '/novel/1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/novel/:id" element={<BookDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BookDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    vi.mocked(novelsApi.get).mockResolvedValue(baseNovel);
    vi.mocked(novelsApi.getCoverUrl).mockResolvedValue('blob:cover');
    vi.mocked(novelsApi.delete).mockResolvedValue({ message: 'Novel deleted' });
    vi.mocked(analysisApi.getStatus).mockResolvedValue(createStatusResponse());
    vi.mocked(analysisApi.start).mockResolvedValue(createStatusResponse({ status: 'running', currentStage: 'chapters', canStart: false, canPause: true }));
    vi.mocked(analysisApi.pause).mockResolvedValue(createStatusResponse({ status: 'pausing', currentStage: 'chapters', canStart: false, canPause: true }));
    vi.mocked(analysisApi.resume).mockResolvedValue(createStatusResponse({ status: 'running', currentStage: 'chapters', canStart: false, canPause: true }));
    vi.mocked(analysisApi.restart).mockResolvedValue(createStatusResponse({ status: 'running', currentStage: 'chapters', canStart: false, canPause: true }));
  });

  it('renders the not-found state when loading the novel fails', async () => {
    vi.mocked(novelsApi.get).mockRejectedValueOnce(new Error('Novel not found'));
    renderPage();

    expect(await screen.findByText('Novel not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'common.actions.backToBookshelf' })).toHaveAttribute('href', '/');
  });

  it('falls back to TxtCover when the novel has no stored cover', async () => {
    vi.mocked(novelsApi.get).mockResolvedValueOnce(baseNovel);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mock Novel', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('txt-cover')).toHaveTextContent('Mock Novel');
    expect(novelsApi.getCoverUrl).not.toHaveBeenCalled();
  });

  it('starts analysis when the current job can start', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mock Novel', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'bookDetail.startAnalysis' }));

    expect(analysisApi.start).toHaveBeenCalledWith(1);
    expect(await screen.findByText('bookDetail.analysisActionStarted')).toBeInTheDocument();
  });

  it('pauses a running analysis job', async () => {
    vi.mocked(analysisApi.getStatus).mockResolvedValue(
      createStatusResponse({
        status: 'running',
        currentStage: 'chapters',
        totalChunks: 2,
        completedChunks: 1,
        analyzedChapters: 3,
        totalChapters: 6,
        progressPercent: 50,
        canStart: false,
        canPause: true,
        currentChunk: {
          chunkIndex: 1,
          startChapterIndex: 3,
          endChapterIndex: 5,
          chapterIndices: [3, 4, 5],
          status: 'running',
          chunkSummary: '',
          errorMessage: '',
          updatedAt: null,
        },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('button', { name: 'bookDetail.pauseAnalysis' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'bookDetail.pauseAnalysis' }));

    expect(analysisApi.pause).toHaveBeenCalledWith(1);
    expect(await screen.findByText('bookDetail.analysisActionPauseRequested')).toBeInTheDocument();
  });

  it('renders resume and restart actions for a paused analysis job', async () => {
    vi.mocked(analysisApi.getStatus).mockResolvedValue(
      createStatusResponse({
        status: 'paused',
        currentStage: 'chapters',
        totalChunks: 2,
        completedChunks: 1,
        analyzedChapters: 3,
        totalChapters: 6,
        canStart: false,
        canResume: true,
        canRestart: true,
      }),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('button', { name: 'bookDetail.resumeAnalysis' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'bookDetail.startAnalysis' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'bookDetail.resumeAnalysis' }));
    expect(analysisApi.resume).toHaveBeenCalledWith(1);
  });

  it('deletes the novel after confirming in the modal', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mock Novel', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'bookDetail.deleteBook' }));
    expect(screen.getByText('bookDetail.deleteConfirm')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'common.actions.delete' }));

    await waitFor(() => {
      expect(novelsApi.delete).toHaveBeenCalledWith(1);
    });
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });
});
