import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReaderPage from '../ReaderPage';
import { analysisApi } from '@domains/analysis';
import type { AnalysisJobStatus } from '@domains/analysis';
import { readerApi } from '../../api/readerApi';
import { resetReaderSessionStoreForTests } from '../../hooks/sessionStore';

const i18nMock = vi.hoisted(() => ({
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock('../../api/readerApi', () => ({
  readerApi: {
    getChapters: vi.fn(),
    getProgress: vi.fn(),
    getChapterContent: vi.fn(),
    saveProgress: vi.fn(),
    getImageBlob: vi.fn(),
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

const originalOffsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetTopDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalScrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

type HTMLElementPrototypeNumberProperty =
  | 'offsetHeight'
  | 'offsetTop'
  | 'clientWidth'
  | 'clientHeight'
  | 'scrollWidth';

function setPrototypeNumberGetter(
  property: Exclude<HTMLElementPrototypeNumberProperty, 'offsetTop'>,
  value: number,
) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get: () => value,
  });
}

function restorePrototypeDescriptor(
  property: HTMLElementPrototypeNumberProperty,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(HTMLElement.prototype, property, descriptor);
    return;
  }

  Reflect.deleteProperty(HTMLElement.prototype, property);
}

function setOffsetTopByChapterTitle(offsetMap: Record<string, number>) {
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      const text = this.textContent ?? '';
      for (const [title, offset] of Object.entries(offsetMap)) {
        if (text.includes(title)) {
          return offset;
        }
      }
      return 0;
    },
  });
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
    </MemoryRouter>
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function enablePagedTestLayout(scrollWidth: number = 400) {
  setPrototypeNumberGetter('clientWidth', 600);
  setPrototypeNumberGetter('clientHeight', 800);
  setPrototypeNumberGetter('scrollWidth', scrollWidth);
}

function getPagedReaderContainer(container: HTMLElement): HTMLDivElement {
  const readerContainer = container.querySelector('main .cursor-pointer.overflow-hidden') as HTMLDivElement | null;
  if (!readerContainer) {
    throw new Error('Paged reader container not found');
  }

  Object.defineProperty(readerContainer, 'getBoundingClientRect', {
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

  return readerContainer;
}

function getPagedViewport(container: HTMLElement): HTMLDivElement {
  const pagedViewport = container.querySelector('[data-testid="paged-reader-measurement-viewport"]') as HTMLDivElement | null;
  if (!pagedViewport) {
    throw new Error('Paged viewport not found');
  }

  return pagedViewport;
}

describe('ReaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetReaderSessionStoreForTests();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(readerApi.getChapters).mockResolvedValue(chapters);
    vi.mocked(readerApi.getProgress).mockResolvedValue({
      chapterIndex: 0,
      scrollPosition: 0,
      viewMode: 'original',
      chapterProgress: 0,
      isTwoColumn: false,
    });
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => chapterContent[chapterIndex]);
    vi.mocked(readerApi.saveProgress).mockResolvedValue({ message: 'Progress saved' });
    vi.mocked(readerApi.getImageBlob).mockResolvedValue(null);
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
    restorePrototypeDescriptor('offsetHeight', originalOffsetHeightDescriptor);
    restorePrototypeDescriptor('offsetTop', originalOffsetTopDescriptor);
    restorePrototypeDescriptor('clientWidth', originalClientWidthDescriptor);
    restorePrototypeDescriptor('clientHeight', originalClientHeightDescriptor);
    restorePrototypeDescriptor('scrollWidth', originalScrollWidthDescriptor);
  });

  it('restores the stored chapter and summary view from reader state', async () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 1,
      viewMode: 'summary',
      isTwoColumn: false,
    }));
    vi.mocked(analysisApi.getChapterAnalysis).mockResolvedValueOnce({ analysis: completedAnalysis });
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
    expect(readerApi.getChapterContent).toHaveBeenCalledWith(1, 1, expect.any(Object));
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 1,
      viewMode: 'summary',
      isTwoColumn: false,
    });
  });

  it('loads the selected chapter and persists progress when a chapter is chosen', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chapter 2/ }));

    await waitFor(() => {
      expect(readerApi.getChapterContent).toHaveBeenLastCalledWith(1, 1, expect.any(Object));
    });
    expect(await screen.findByRole('heading', { name: 'Chapter 2', level: 1 })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 1,
      viewMode: 'original',
      isTwoColumn: false,
      chapterProgress: 0,
    });
  });

  it('opens the mobile contents sheet and closes it after selecting a chapter', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('reader.contents')[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Chapter 2/ }));

    await waitFor(() => {
      expect(readerApi.getChapterContent).toHaveBeenLastCalledWith(1, 1, expect.any(Object));
    });
    expect(await screen.findByRole('heading', { name: 'Chapter 2', level: 1 })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('lets the mobile contents button close the table of contents after it has opened', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('reader.contents')[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('reader.contents')[0]);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('renders adjacent chapters in scroll mode without waiting for a scroll event', async () => {
    const shortChapters = Array.from({ length: 4 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      wordCount: 20 + index,
    }));
    const shortChapterContent = shortChapters.map((chapter, index) => ({
      ...chapter,
      content: `${chapter.title} short content`,
      totalChapters: shortChapters.length,
      hasPrev: index > 0,
      hasNext: index < shortChapters.length - 1,
    }));

    vi.mocked(readerApi.getChapters).mockResolvedValueOnce(shortChapters);
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => shortChapterContent[chapterIndex]);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Chapter 2', level: 1 })).toBeInTheDocument();
    });
  });

  it('does not let stale scroll anchor override chapter selection from the table of contents', async () => {
    const longChapters = Array.from({ length: 6 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      wordCount: 100 + index,
    }));
    const longChapterContent = longChapters.map((chapter, index) => ({
      ...chapter,
      content: `${chapter.title} content`,
      totalChapters: longChapters.length,
      hasPrev: index > 0,
      hasNext: index < longChapters.length - 1,
    }));
    const deferredTargetChapter = createDeferred<(typeof longChapterContent)[number]>();

    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 2,
      viewMode: 'original',
      isTwoColumn: false,
    }));
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce(longChapters);
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => {
      if (chapterIndex === 5) {
        return deferredTargetChapter.promise;
      }
      return longChapterContent[chapterIndex];
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(readerApi.getChapterContent).toHaveBeenCalledWith(1, 2, expect.any(Object));
    });

    fireEvent.click(screen.getByRole('button', { name: /Chapter 6/i }));

    const readerContainer = container.querySelector('main .overflow-y-auto.hide-scrollbar') as HTMLDivElement | null;
    expect(readerContainer).not.toBeNull();

    readerContainer!.scrollTop = 12;
    fireEvent.scroll(readerContainer!);

    deferredTargetChapter.resolve(longChapterContent[5]);

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
        chapterIndex: 5,
        viewMode: 'original',
      });
    });
    expect(screen.getByRole('button', { name: /Chapter 6/i })).toHaveAttribute('data-active', 'true');
  });

  it('scrolls to the selected chapter itself in scroll mode navigation', async () => {
    const longChapters = Array.from({ length: 12 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      wordCount: 100 + index,
    }));
    const longChapterContent = longChapters.map((chapter, index) => ({
      ...chapter,
      content: `${chapter.title} content`,
      totalChapters: longChapters.length,
      hasPrev: index > 0,
      hasNext: index < longChapters.length - 1,
    }));

    setPrototypeNumberGetter('offsetHeight', 200);
    setOffsetTopByChapterTitle({
      'Chapter 8': 0,
      'Chapter 9': 220,
      'Chapter 10': 440,
      'Chapter 11': 660,
      'Chapter 12': 880,
    });
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce(longChapters);
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => longChapterContent[chapterIndex]);

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chapter 10/i }));

    const readerContainer = container.querySelector('main .overflow-y-auto.hide-scrollbar') as HTMLDivElement | null;
    expect(readerContainer).not.toBeNull();

    await waitFor(() => {
      expect(readerContainer?.scrollTop).toBe(440);
    });
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 9,
      viewMode: 'original',
    });
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
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      viewMode: 'summary',
      isTwoColumn: false,
    });
  });

  it('restores legacy scrollPosition in scroll mode', async () => {
    setPrototypeNumberGetter('offsetHeight', 400);
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: false,
      scrollPosition: 240,
    }));

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    const readerContainer = container.querySelector('main .overflow-y-auto.hide-scrollbar') as HTMLDivElement | null;
    expect(readerContainer).not.toBeNull();

    await waitFor(() => {
      expect(readerContainer?.scrollTop).toBe(240);
    });
  });

  it('restores paged progress from chapterProgress', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const flushAnimationFrames = async () => {
      while (frameCallbacks.length > 0) {
        const queuedCallbacks = frameCallbacks.splice(0, frameCallbacks.length);
        await act(async () => {
          queuedCallbacks.forEach((callback) => callback(0));
          await Promise.resolve();
        });
      }
    };

    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    setPrototypeNumberGetter('scrollWidth', 1500);
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: true,
      chapterProgress: 1,
    }));

    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    try {
      const { container } = renderPage();

      expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
      await flushAnimationFrames();

      expect(await screen.findAllByText('3 / 3')).not.toHaveLength(0);
      expect(getPagedViewport(container).scrollLeft).toBe(900);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('keeps the loading overlay visible until paged restore reaches the stored page', async () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const flushAnimationFrames = async () => {
      while (frameCallbacks.length > 0) {
        const queuedCallbacks = frameCallbacks.splice(0, frameCallbacks.length);
        await act(async () => {
          queuedCallbacks.forEach((callback) => callback(0));
          await Promise.resolve();
        });
      }
    };

    setPrototypeNumberGetter('clientWidth', 600);
    setPrototypeNumberGetter('clientHeight', 800);
    setPrototypeNumberGetter('scrollWidth', 1500);
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: true,
      chapterProgress: 0.5,
    }));

    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    try {
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'Loading reader content' })).toBeInTheDocument();
      expect(screen.queryByText('2 / 3')).not.toBeInTheDocument();

      await flushAnimationFrames();

      expect(await screen.findAllByText('2 / 3')).not.toHaveLength(0);
      await waitFor(() => {
        expect(screen.queryByRole('status', { name: 'Loading reader content' })).not.toBeInTheDocument();
      });
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('does not skip chapters when rapid wheel paging overlaps an async chapter transition', async () => {
    const pagedChapters = Array.from({ length: 3 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      wordCount: 100 + index,
    }));
    const pagedChapterContent = pagedChapters.map((chapter, index) => ({
      ...chapter,
      content: `${chapter.title} content`,
      totalChapters: pagedChapters.length,
      hasPrev: index > 0,
      hasNext: index < pagedChapters.length - 1,
    }));
    const deferredSecondChapter = createDeferred<(typeof pagedChapterContent)[number]>();

    enablePagedTestLayout(900);
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: true,
      chapterProgress: 1,
    }));
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce(pagedChapters);
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => {
      if (chapterIndex === 1) {
        return deferredSecondChapter.promise;
      }
      return pagedChapterContent[chapterIndex];
    });

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(await screen.findAllByText('2 / 2')).not.toHaveLength(0);
    const readerContainer = getPagedReaderContainer(container);

    const firstWheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    Object.defineProperty(firstWheel, 'deltaX', { value: 0 });
    readerContainer.dispatchEvent(firstWheel);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 320));
    });

    const secondWheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    Object.defineProperty(secondWheel, 'deltaX', { value: 0 });
    readerContainer.dispatchEvent(secondWheel);

    deferredSecondChapter.resolve(pagedChapterContent[1]);

    expect(await screen.findByRole('heading', { name: 'Chapter 2', level: 2 })).toBeInTheDocument();
    expect(await screen.findAllByText('2 / 2')).not.toHaveLength(0);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Chapter 3', level: 2 })).not.toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 1,
      isTwoColumn: true,
      viewMode: 'original',
    });
  });

  it('does not skip chapters when rapid right-side clicks overlap a cached chapter transition', async () => {
    const pagedChapters = Array.from({ length: 3 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      wordCount: 100 + index,
    }));
    const pagedChapterContent = pagedChapters.map((chapter, index) => ({
      ...chapter,
      content: `${chapter.title} content`,
      totalChapters: pagedChapters.length,
      hasPrev: index > 0,
      hasNext: index < pagedChapters.length - 1,
    }));

    enablePagedTestLayout(900);
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: true,
      chapterProgress: 1,
    }));
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce(pagedChapters);
    vi.mocked(readerApi.getChapterContent).mockImplementation(async (_novelId, chapterIndex) => pagedChapterContent[chapterIndex]);

    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 2 })).toBeInTheDocument();
    expect(await screen.findAllByText('2 / 2')).not.toHaveLength(0);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 160));
    });

    const readerContainer = getPagedReaderContainer(container);

    act(() => {
      fireEvent.click(readerContainer, { clientX: 90, clientY: 50 });
      fireEvent.click(readerContainer, { clientX: 90, clientY: 50 });
    });

    expect(await screen.findByRole('heading', { name: 'Chapter 2', level: 2 })).toBeInTheDocument();
    expect(await screen.findAllByText('2 / 2')).not.toHaveLength(0);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Chapter 3', level: 2 })).not.toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('reader-state:1')!)).toMatchObject({
      chapterIndex: 1,
      isTwoColumn: true,
      viewMode: 'original',
    });
  });

  it('shows the unified loading state while chapter content is loading in scroll mode', async () => {
    const deferredChapter = createDeferred<(typeof chapterContent)[number]>();
    vi.mocked(readerApi.getChapterContent).mockImplementationOnce(async () => deferredChapter.promise);

    renderPage();

    await waitFor(() => {
      expect(readerApi.getChapterContent).toHaveBeenCalledWith(1, 0, expect.any(Object));
    });
    expect(screen.queryByText('reader.noChapters')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading reader content' })).toBeInTheDocument();

    deferredChapter.resolve(chapterContent[0]);

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
  });

  it('flushes the latest reading state on pagehide', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Chapter 1', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chapter 2/ }));

    window.dispatchEvent(new Event('pagehide'));

    await waitFor(() => {
      expect(readerApi.saveProgress).toHaveBeenCalledWith(1, expect.objectContaining({
        chapterIndex: 1,
        viewMode: 'original',
        chapterProgress: 0,
        isTwoColumn: false,
      }));
    });
  });

  it('renders an empty state when the novel has no chapters', async () => {
    vi.mocked(readerApi.getChapters).mockResolvedValueOnce([]);
    vi.mocked(readerApi.getChapterContent).mockRejectedValueOnce(new Error('Chapter not found'));
    renderPage();

    expect(await screen.findByText('reader.noChapters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'reader.goBack' })).toHaveAttribute('href', '/novel/1');
  });
});
