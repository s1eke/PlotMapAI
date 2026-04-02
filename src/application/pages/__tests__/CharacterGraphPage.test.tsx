import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import {
  loadCharacterGraphPageData,
} from '@application/use-cases/library';
import { refreshAnalysisOverview } from '@application/use-cases/analysis';
import { createAppError, AppErrorCode } from '@shared/errors';
import { useCharacterGraphCanvasController } from '@domains/character-graph';

import CharacterGraphPage from '../CharacterGraphPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@application/use-cases/library', () => ({
  loadCharacterGraphPageData: vi.fn(),
}));

vi.mock('@application/use-cases/analysis', () => ({
  refreshAnalysisOverview: vi.fn(),
}));

vi.mock('@domains/character-graph', () => ({
  useCharacterGraphCanvasController: vi.fn(),
  CharacterGraphStage: ({
    actionMessage,
    canRefreshOverview,
    novelTitle,
    onRefreshOverview,
  }: {
    actionMessage: string | null;
    canRefreshOverview: boolean;
    novelTitle: string;
    onRefreshOverview: () => void;
  }) => (
    <div>
      <div>{novelTitle}</div>
      {actionMessage ? <div>{actionMessage}</div> : null}
      {canRefreshOverview ? (
        <button type="button" onClick={onRefreshOverview}>
          characterGraph.refreshGraph
        </button>
      ) : null}
    </div>
  ),
}));

function renderPage(initialEntry = '/novel/1/graph') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>bookshelf-home</div>} />
        <Route path="/novel/:id/graph" element={<CharacterGraphPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

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

describe('application CharacterGraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })));
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

  it('loads graph data and refreshes the overview through application use-cases', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText('Mock Novel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'characterGraph.refreshGraph' }));

    expect(refreshAnalysisOverview).toHaveBeenCalledWith(1);
  });

  it('surfaces layout errors from the graph canvas controller', async () => {
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

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('errors.WORKER_UNAVAILABLE')).toBeInTheDocument();
    });
  });
});
