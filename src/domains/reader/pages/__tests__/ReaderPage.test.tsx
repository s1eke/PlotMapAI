import type { AnalysisJobStatus } from '@domains/analysis';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@infra/db';
import { APP_SETTING_KEYS, storage } from '@infra/storage';
import { mergeReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';
import { analysisApi } from '@domains/analysis';
import { buildChapterImageGalleryEntries } from '@shared/text-processing';

import { readerApi } from '../../api/readerApi';
import { resetReaderSessionStoreForTests } from '../../hooks/sessionStore';
import ReaderPage from '../ReaderPage';

const i18nMock = vi.hoisted(() => ({
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock('../../api/readerApi', () => ({
  readerApi: {
    getChapters: vi.fn(),
    getChapterContent: vi.fn(),
    getImageBlob: vi.fn(),
    getImageGalleryEntries: vi.fn(),
    getImageUrl: vi.fn(),
  },
}));

const useChapterAnalysisMock = vi.hoisted(() => vi.fn());

vi.mock('@domains/analysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@domains/analysis')>();
  return {
    ...actual,
    analysisApi: {
      ...actual.analysisApi,
      getStatus: vi.fn(),
      getChapterAnalysis: vi.fn(),
      analyzeChapter: vi.fn(),
    },
    useChapterAnalysis: useChapterAnalysisMock,
  };
});

vi.mock('../../hooks/useReaderRenderCache', async () => {
  const renderCacheStub = await import('../../test/deterministicRenderCacheStub');
  return {
    useReaderRenderCache: renderCacheStub.useDeterministicReaderRenderCache,
  };
});

const chapters = [
  { index: 0, title: 'Chapter 1', wordCount: 100 },
  { index: 1, title: 'Chapter 2', wordCount: 120 },
];

const chapterContent = [
  {
    index: 0,
    title: 'Chapter 1',
    content: 'Chapter 1 content',
    wordCount: 100,
    totalChapters: 2,
    hasPrev: false,
    hasNext: true,
  },
  {
    index: 1,
    title: 'Chapter 2',
    content: 'Chapter 2 content',
    wordCount: 120,
    totalChapters: 2,
    hasPrev: true,
    hasNext: false,
  },
];

const completedAnalysis = {
  chapterIndex: 1,
  chapterTitle: 'Chapter 2',
  summary: 'Summary for chapter 2',
  keyPoints: ['Key point'],
  characters: [],
  relationships: [],
  tags: ['tag'],
  chunkIndex: 0,
  updatedAt: null,
};

const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth',
);
const originalClientHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientHeight',
);

function setPrototypeNumberGetter(
  property: 'clientHeight' | 'clientWidth',
  value: number,
) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get: () => value,
  });
}

function restorePrototypeDescriptor(
  property: 'clientHeight' | 'clientWidth',
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(HTMLElement.prototype, property, descriptor);
    return;
  }

  Reflect.deleteProperty(HTMLElement.prototype, property);
}

function createJob(overrides: Partial<AnalysisJobStatus> = {}): AnalysisJobStatus {
  return {
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
    currentChunk: null,
    canStart: true,
    canPause: false,
    canResume: false,
    canRestart: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novel/1/read']}>
      <Routes>
        <Route path="/novel/:id/read" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function seedReaderStateCache(state: Record<string, unknown>): void {
  mergeReaderStateCacheSnapshot(1, state);
}

async function seedDurableProgress(
  overrides: Partial<{
    chapterIndex: number;
    scrollPosition: number;
    mode: 'scroll' | 'paged' | 'summary';
    chapterProgress: number;
    locatorVersion: 1;
    locator: {
      chapterIndex: number;
      blockIndex: number;
      kind: 'heading' | 'text' | 'image';
      lineIndex?: number;
      edge?: 'start' | 'end';
    };
  }> = {},
): Promise<void> {
  await db.readingProgress.add({
    novelId: 1,
    chapterIndex: 0,
    scrollPosition: 0,
    mode: 'scroll',
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

async function readDurableProgress() {
  return db.readingProgress.where('novelId').equals(1).first();
}

describe('ReaderPage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.clearAllMocks();
    localStorage.clear();
    resetReaderSessionStoreForTests();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(readerApi.getChapters).mockResolvedValue(chapters);
    vi.mocked(readerApi.getChapterContent).mockImplementation(
      async (_novelId, chapterIndex) => chapterContent[chapterIndex],
    );
    vi.mocked(readerApi.getImageBlob).mockResolvedValue(null);
    vi.mocked(readerApi.getImageGalleryEntries).mockResolvedValue([]);
    vi.mocked(readerApi.getImageUrl).mockResolvedValue(null);
    vi.mocked(analysisApi.getStatus).mockResolvedValue({
      job: createJob(),
      overview: null,
      chunks: [],
    });
    vi.mocked(analysisApi.getChapterAnalysis).mockResolvedValue({ analysis: null });
    vi.mocked(analysisApi.analyzeChapter).mockResolvedValue({ analysis: completedAnalysis });
    useChapterAnalysisMock.mockReturnValue({
      analysisStatus: null,
      chapterAnalysis: null,
      isChapterAnalysisLoading: false,
      isAnalyzingChapter: false,
      handleAnalyzeChapter: vi.fn(),
    });
  });

  afterEach(() => {
    restorePrototypeDescriptor('clientWidth', originalClientWidthDescriptor);
    restorePrototypeDescriptor('clientHeight', originalClientHeightDescriptor);
  });

  it('renders the stored summary view on startup', async () => {
    seedReaderStateCache({
      chapterIndex: 1,
      mode: 'summary',
    });
    vi.mocked(analysisApi.getChapterAnalysis).mockResolvedValueOnce({
      analysis: completedAnalysis,
    });
    useChapterAnalysisMock.mockReturnValue({
      analysisStatus: null,
      chapterAnalysis: completedAnalysis,
      isChapterAnalysisLoading: false,
      isAnalyzingChapter: false,
      handleAnalyzeChapter: vi.fn(),
    });

    renderPage();

    expect(await screen.findByText('Summary for chapter 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 2', level: 3 })).toBeInTheDocument();
  });

  it('renders the paged reading surface when startup mode is paged', async () => {
    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    seedReaderStateCache({
      chapterIndex: 0,
      mode: 'paged',
    });
    vi.mocked(readerApi.getChapterContent).mockResolvedValueOnce({
      ...chapterContent[0],
      content: 'First page\nSecond page\nThird page\nFourth page',
    });

    renderPage();

    expect(await screen.findByTestId('paged-reader-page-frame')).toBeInTheDocument();
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  });

  it('prefers Dexie progress over the cache snapshot on startup', async () => {
    seedReaderStateCache({
      chapterIndex: 0,
      mode: 'scroll',
    });
    await seedDurableProgress({
      chapterIndex: 1,
      scrollPosition: 120,
      mode: 'scroll',
      chapterProgress: 0.2,
    });

    renderPage();

    expect(await screen.findByText('Chapter 2 content')).toBeInTheDocument();
  });

  it('navigates to the selected chapter from the table of contents in scroll mode', async () => {
    renderPage();

    expect(await screen.findByText('Chapter 1 content')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('reader.contents')[0]);
    const contentsDialog = await screen.findByRole('dialog');
    fireEvent.click(within(contentsDialog).getByRole('button', { name: 'Chapter 2' }));

    await waitFor(() => {
      expect(readerApi.getChapterContent).toHaveBeenCalledWith(1, 1, expect.anything());
    });
    expect(await screen.findByText('Chapter 2 content')).toBeInTheDocument();

    fireEvent(window, new Event('pagehide'));

    await waitFor(async () => {
      const progress = await readDurableProgress();
      expect(progress).not.toBeNull();
      expect(progress?.mode).toBe('scroll');
    });
  });

  it('navigates to the selected chapter from the table of contents in paged mode', async () => {
    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    await storage.primary.settings.set(APP_SETTING_KEYS.readerPageTurnMode, 'cover');
    seedReaderStateCache({
      chapterIndex: 0,
      mode: 'paged',
      lastContentMode: 'paged',
    });

    renderPage();

    expect(await screen.findByTestId('paged-reader-page-frame')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('reader.contents')[0]);
    const contentsDialog = await screen.findByRole('dialog');
    fireEvent.click(within(contentsDialog).getByRole('button', { name: 'Chapter 2' }));

    await waitFor(() => {
      expect(readerApi.getChapterContent).toHaveBeenCalledWith(1, 1, expect.anything());
    });
    expect(await screen.findByRole('heading', { name: 'Chapter 2' })).toBeInTheDocument();
  });

  it('prefers the stored paged page-turn mode over a stale scroll reading mode on startup', async () => {
    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    await storage.primary.settings.set(APP_SETTING_KEYS.readerPageTurnMode, 'cover');
    seedReaderStateCache({
      chapterIndex: 0,
      mode: 'scroll',
      lastContentMode: 'scroll',
    });
    vi.mocked(readerApi.getChapterContent).mockResolvedValueOnce({
      ...chapterContent[0],
      content: 'First page\nSecond page\nThird page\nFourth page',
    });

    renderPage();

    expect(await screen.findByTestId('paged-reader-page-frame')).toBeInTheDocument();
  });

  it('advances within the current paged chapter before navigating to the next chapter', async () => {
    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    seedReaderStateCache({
      chapterIndex: 0,
      mode: 'paged',
    });
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => ({
      ...chapterContent[chapterIndex],
      content: [
        'Paragraph 1',
        'Paragraph 2',
        'Paragraph 3',
        'Paragraph 4',
      ].join('\n'),
    }));

    renderPage();

    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'Loading reader content' }),
      ).not.toBeInTheDocument();
    });
    const readerViewport = screen.getByTestId('reader-viewport');

    Object.defineProperty(readerViewport, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 600,
        height: 800,
        right: 600,
        bottom: 800,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(readerViewport, { clientX: 540, clientY: 200 });

    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
  });

  it('switches from scroll to paged and flushes a canonical locator to Dexie', async () => {
    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);

    renderPage();

    expect(await screen.findByText('Chapter 1 content')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('reader.twoColumn')[0]);

    expect(await screen.findByTestId('paged-reader-page-frame')).toBeInTheDocument();

    fireEvent(window, new Event('pagehide'));

    await waitFor(async () => {
      const progress = await readDurableProgress();
      expect(progress?.chapterIndex).toBe(0);
      expect(progress?.mode).toBe('paged');
      expect(progress?.locatorVersion).toBe(1);
      expect(progress?.locator?.chapterIndex).toBe(0);
      expect(progress?.chapterProgress).toBeUndefined();
    });
  });

  it('returns to paged content after a summary round-trip without persisting summary as durable mode', async () => {
    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    await storage.primary.settings.set(APP_SETTING_KEYS.readerPageTurnMode, 'cover');

    renderPage();

    expect(await screen.findByTestId('paged-reader-page-frame')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'reader.summary' }));

    expect(await screen.findByText('reader.analysisPanel.statusEmpty')).toBeInTheDocument();

    fireEvent(window, new Event('pagehide'));

    await waitFor(async () => {
      const progress = await readDurableProgress();
      expect(progress?.mode).toBe('paged');
    });

    fireEvent.click(screen.getByRole('button', { name: 'reader.original' }));

    expect(await screen.findByTestId('paged-reader-page-frame')).toBeInTheDocument();
  });

  it('opens the mobile contents sheet and closes it after selecting a chapter', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('reader.contents')[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Chapter 2/ }));

    expect(await screen.findByRole('heading', { name: 'Chapter 2', level: 1 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('uses the first scroll gesture to hide reader chrome without moving the reading surface', async () => {
    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();

    const readerContainer = container.querySelector(
      'main .cursor-pointer.overflow-y-auto.hide-scrollbar',
    ) as HTMLDivElement | null;

    expect(readerContainer).not.toBeNull();

    Object.defineProperty(readerContainer!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.click(readerContainer!, { clientX: 50, clientY: 50 });

    await waitFor(() => {
      expect(readerContainer).toHaveClass('overflow-hidden');
    });

    fireEvent.wheel(readerContainer!, { deltaY: 120 });

    await waitFor(() => {
      expect(readerContainer).toHaveClass('overflow-y-auto');
      expect(readerContainer).not.toHaveClass('overflow-hidden');
    });
  });

  it('opens the image viewer from scroll mode and restores the reading surface after close', async () => {
    const imageChapter = {
      index: 0,
      title: 'Chapter 1',
      content: 'Before image\n[IMG:cover]\nAfter image',
      wordCount: 120,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };

    vi.mocked(readerApi.getChapters).mockResolvedValueOnce([
      { index: 0, title: imageChapter.title, wordCount: imageChapter.wordCount },
    ]);
    vi.mocked(readerApi.getChapterContent).mockResolvedValueOnce(imageChapter);

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();

    const readerContainer = container.querySelector(
      'main .cursor-pointer.overflow-y-auto.hide-scrollbar',
    ) as HTMLDivElement | null;

    expect(readerContainer).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'reader.imageViewer.title' }));

    expect(await screen.findByRole('dialog', { name: 'reader.imageViewer.title' })).toBeInTheDocument();
    expect(readerContainer).toHaveClass('overflow-hidden');

    const imageViewerStage = document.body.querySelector(
      '[data-reader-image-stage]',
    ) as HTMLDivElement | null;

    expect(imageViewerStage).not.toBeNull();

    fireEvent.click(imageViewerStage!, { clientX: 12, clientY: 12 });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'reader.imageViewer.title' })).not.toBeInTheDocument();
      expect(readerContainer).toHaveClass('overflow-y-auto');
    });
  });

  it('resolves the image viewer index against the whole-book gallery order', async () => {
    const imageChapters = Array.from({ length: 10 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      content: `Before image\n[IMG:image-${index + 1}]\nAfter image`,
      wordCount: 100 + index,
      totalChapters: 10,
      hasPrev: index > 0,
      hasNext: index < 9,
    }));

    seedReaderStateCache({
      chapterIndex: 9,
      mode: 'scroll',
    });
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce(
      imageChapters.map(({ index, title, wordCount }) => ({ index, title, wordCount })),
    );
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => (
      imageChapters[chapterIndex] ?? imageChapters[0]
    ));
    vi.mocked(readerApi.getImageGalleryEntries).mockResolvedValueOnce(
      imageChapters.flatMap((chapter) => buildChapterImageGalleryEntries(chapter)),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 10', level: 1 })).toBeInTheDocument();

    const imageButtons = screen.getAllByRole('button', { name: 'reader.imageViewer.title' });
    fireEvent.click(imageButtons[imageButtons.length - 1]!);

    expect(await screen.findByRole('dialog', { name: 'reader.imageViewer.title' })).toBeInTheDocument();
    expect(await screen.findByText('10 / 10')).toBeInTheDocument();
  });

  it('uses the full-book image order when a chapter contains multiple images', async () => {
    const imageChapter = {
      index: 0,
      title: 'Chapter 1',
      content: 'Intro\n[IMG:cover]\nMiddle\n[IMG:map]\nEnding\n[IMG:diagram]',
      wordCount: 180,
      totalChapters: 1,
      hasPrev: false,
      hasNext: false,
    };

    vi.mocked(readerApi.getChapters).mockResolvedValueOnce([
      { index: 0, title: imageChapter.title, wordCount: imageChapter.wordCount },
    ]);
    vi.mocked(readerApi.getChapterContent).mockResolvedValueOnce(imageChapter);
    vi.mocked(readerApi.getImageGalleryEntries).mockResolvedValueOnce([
      ...buildChapterImageGalleryEntries(imageChapter),
    ]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();

    const imageButtons = screen.getAllByRole('button', { name: 'reader.imageViewer.title' });
    fireEvent.click(imageButtons[1]!);

    expect(await screen.findByRole('dialog', { name: 'reader.imageViewer.title' })).toBeInTheDocument();
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
  });

  it('switches to summary view and shows queued analysis state when chapter analysis is missing', async () => {
    const runningStatus = {
      job: createJob({
        status: 'running',
        currentStage: 'chapters',
        analysisComplete: false,
        totalChapters: 2,
        analyzedChapters: 1,
        totalChunks: 2,
        completedChunks: 1,
        currentChunkIndex: 0,
        progressPercent: 50,
        canStart: false,
        canPause: true,
        currentChunk: {
          chunkIndex: 0,
          startChapterIndex: 0,
          endChapterIndex: 0,
          chapterIndices: [0],
          status: 'running',
          chunkSummary: '',
          errorMessage: '',
          updatedAt: null,
        },
      }),
      overview: null,
      chunks: [],
    };

    vi.mocked(analysisApi.getStatus).mockResolvedValueOnce(runningStatus);
    useChapterAnalysisMock.mockReturnValue({
      analysisStatus: runningStatus,
      chapterAnalysis: null,
      isChapterAnalysisLoading: false,
      isAnalyzingChapter: false,
      handleAnalyzeChapter: vi.fn(),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'reader.summary' }));

    expect(await screen.findByText('reader.analysisPanel.statusQueued')).toBeInTheDocument();
    expect(screen.getByText('reader.analysisPanel.progressTitle')).toBeInTheDocument();
  });

  it('shows the unified loading state while chapter content is loading in scroll mode', async () => {
    let resolveChapter: ((chapter: typeof chapterContent[number]) => void) | null = null;
    const loadingChapter = new Promise<(typeof chapterContent)[number]>((resolve) => {
      resolveChapter = resolve;
    });

    vi.mocked(readerApi.getChapterContent).mockImplementationOnce(async () => loadingChapter);

    renderPage();

    expect(await screen.findByRole('status', { name: 'Loading reader content' })).toBeInTheDocument();

    resolveChapter?.(chapterContent[0]);

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
  });

  it('renders an empty state when the novel has no chapters', async () => {
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByText('reader.noChapters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'reader.goBack' })).toHaveAttribute('href', '/novel/1');
  });
});
