import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshAnalysisOverview } from '@application/use-cases/analysis';
import { loadCharacterGraphPageData } from '@application/use-cases/library';
import { useCharacterGraphCanvasController } from '@domains/character-graph';
import { AppErrorCode, createAppError } from '@shared/errors';

import { useCharacterGraphPageViewModel } from '../useCharacterGraphPageViewModel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@shared/debug', () => ({
  reportAppError: vi.fn(),
}));

vi.mock('@application/use-cases/library', () => ({
  loadCharacterGraphPageData: vi.fn(),
}));

vi.mock('@application/use-cases/analysis', () => ({
  refreshAnalysisOverview: vi.fn(),
}));

vi.mock('@domains/character-graph', () => ({
  CharacterGraphStage: () => null,
  useCharacterGraphCanvasController: vi.fn(),
}));

function createCanvasState() {
  return {
    actions: {
      clearSelection: vi.fn(),
      resetLayout: vi.fn(),
      selectNode: vi.fn(),
    },
    bindings: {
      onCanvasPointerDown: vi.fn(),
      onNodeMouseEnter: vi.fn(),
      onNodeMouseLeave: vi.fn(),
      onNodePointerDown: vi.fn(),
      svgRef: { current: null },
    },
    gesture: {
      isInteracting: false,
      isPanning: false,
    },
    layout: {
      edges: [],
      error: null,
      focusNodeId: null,
      highlightedNodeIds: new Set<string>(),
      isComputing: false,
      message: null,
      nodes: [],
      progress: 0,
      relatedEdges: [],
      selectedNode: null,
      selectedNodeId: null,
      stageHeight: 960,
      stageMeta: [],
    },
    viewport: {
      canPanCanvas: false,
      zoomState: {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      },
    },
  };
}

describe('useCharacterGraphPageViewModel', () => {
  let mediaQueryListener: ((event: { matches: boolean }) => void) | null = null;
  let mediaQueryMatches = false;

  beforeEach(() => {
    vi.clearAllMocks();
    mediaQueryListener = null;
    mediaQueryMatches = false;

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(
        (_event: string, listener: (event: { matches: boolean }) => void) => {
          mediaQueryListener = listener;
        },
      ),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: mediaQueryMatches,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(
        (_event: string, listener: (event: { matches: boolean }) => void) => {
          if (mediaQueryListener === listener) {
            mediaQueryListener = null;
          }
        },
      ),
      removeListener: vi.fn(),
    })));

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
      writable: true,
    });

    vi.mocked(loadCharacterGraphPageData).mockResolvedValue({
      graph: {
        edges: [],
        meta: {
          analyzedChapters: 2,
          edgeCount: 0,
          generatedAt: null,
          hasData: true,
          hasOverview: true,
          isComplete: true,
          nodeCount: 1,
          totalChapters: 2,
        },
        nodes: [],
      },
      novel: {
        author: '',
        chapterCount: 2,
        createdAt: new Date().toISOString(),
        description: '',
        fileType: 'txt',
        hasCover: false,
        id: 1,
        originalEncoding: 'utf-8',
        originalFilename: 'mock.txt',
        tags: [],
        title: 'Mock Novel',
        totalWords: 1000,
      },
    });
    vi.mocked(refreshAnalysisOverview).mockResolvedValue({
      chunks: [],
      job: {
        analysisComplete: false,
        analyzedChapters: 2,
        canPause: false,
        canRestart: false,
        canResume: false,
        canStart: false,
        completedAt: null,
        completedChunks: 0,
        currentChunk: null,
        currentChunkIndex: 0,
        currentStage: 'overview',
        lastError: '',
        lastHeartbeat: null,
        pauseRequested: false,
        progressPercent: 0,
        startedAt: null,
        status: 'running',
        totalChapters: 2,
        totalChunks: 0,
        updatedAt: null,
      },
      overview: null,
    });
    vi.mocked(useCharacterGraphCanvasController).mockReturnValue(createCanvasState());
  });

  it('treats invalid novel ids as not-found without loading data', async () => {
    const { result } = renderHook(() => useCharacterGraphPageViewModel(Number.NaN));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(loadCharacterGraphPageData).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({
      code: AppErrorCode.NOVEL_NOT_FOUND,
    });
  });

  it('loads graph data and refreshes the overview', async () => {
    const { result } = renderHook(() => useCharacterGraphPageViewModel(1));

    await waitFor(() => {
      expect(result.current.novel?.title).toBe('Mock Novel');
    });

    expect(result.current.canRefreshOverview).toBe(true);

    await act(async () => {
      await result.current.refreshOverview();
    });

    expect(refreshAnalysisOverview).toHaveBeenCalledWith(1);
    expect(result.current.actionBannerMessage).toBe('characterGraph.refreshStarted');
  });

  it('prioritizes canvas layout errors over action messages', async () => {
    vi.mocked(useCharacterGraphCanvasController).mockReturnValue({
      ...createCanvasState(),
      layout: {
        ...createCanvasState().layout,
        error: createAppError({
          code: AppErrorCode.WORKER_UNAVAILABLE,
          debugMessage: 'worker unavailable',
          kind: 'unsupported',
          source: 'character-graph',
          userMessageKey: 'errors.WORKER_UNAVAILABLE',
        }),
      },
    });

    const { result } = renderHook(() => useCharacterGraphPageViewModel(1));

    await waitFor(() => {
      expect(result.current.novel?.title).toBe('Mock Novel');
    });

    await act(async () => {
      await result.current.refreshOverview();
    });

    expect(result.current.actionBannerMessage).toBe('errors.WORKER_UNAVAILABLE');
  });

  it('syncs mobile and fullscreen state from browser events', async () => {
    const { result } = renderHook(() => useCharacterGraphPageViewModel(1));

    await waitFor(() => {
      expect(result.current.novel?.title).toBe('Mock Novel');
    });

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isFullscreen).toBe(false);

    act(() => {
      mediaQueryListener?.({ matches: true });
    });

    expect(result.current.isMobile).toBe(true);

    const fullscreenElement = document.createElement('div');

    act(() => {
      Object.assign(result.current.fullscreenRef, { current: fullscreenElement });
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: fullscreenElement,
        writable: true,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(result.current.isFullscreen).toBe(true);
  });
});
