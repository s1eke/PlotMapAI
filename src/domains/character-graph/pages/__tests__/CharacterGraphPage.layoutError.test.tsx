import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AppErrorCode, createAppError } from '@shared/errors';
import CharacterGraphPage from '../CharacterGraphPage';
import { analysisApi } from '@domains/analysis';
import { libraryApi } from '@domains/library';
import { useCharacterGraphCanvas } from '../../hooks/useCharacterGraphCanvas';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@domains/library', () => ({
  libraryApi: {
    get: vi.fn(),
  },
}));

vi.mock('@domains/analysis', () => ({
  analysisApi: {
    getCharacterGraph: vi.fn(),
    refreshOverview: vi.fn(),
  },
}));

vi.mock('../../hooks/useCharacterGraphCanvas', () => ({
  useCharacterGraphCanvas: vi.fn(),
}));

const novel = {
  id: 1,
  title: 'Mock Novel',
  author: 'Author',
  description: '',
  tags: [],
  fileType: 'txt',
  hasCover: false,
  originalFilename: 'mock.txt',
  originalEncoding: 'utf-8',
  totalWords: 1200,
  chapterCount: 2,
  createdAt: new Date().toISOString(),
};

const graphResponse = {
  nodes: [
    {
      id: 'hero',
      name: 'Hero',
      role: 'lead',
      description: 'Main character',
      weight: 8,
      sharePercent: 75,
      chapterCount: 2,
      chapters: [0, 1],
      isCore: true,
    },
  ],
  edges: [],
  meta: {
    totalChapters: 2,
    analyzedChapters: 2,
    nodeCount: 1,
    edgeCount: 0,
    hasOverview: true,
    hasData: true,
    isComplete: true,
    generatedAt: null,
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novel/1/graph']}>
      <Routes>
        <Route path="/novel/:id/graph" element={<CharacterGraphPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CharacterGraphPage layout worker unavailable handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(libraryApi.get).mockResolvedValue(novel);
    vi.mocked(analysisApi.getCharacterGraph).mockResolvedValue(graphResponse);
    const refreshOverviewResponse: Awaited<ReturnType<typeof analysisApi.refreshOverview>> = {
      job: { status: 'running' },
      overview: null,
      chunks: [],
    };
    vi.mocked(analysisApi.refreshOverview).mockResolvedValue(refreshOverviewResponse);
    vi.mocked(useCharacterGraphCanvas).mockReturnValue({
      svgRef: { current: null },
      canPanCanvas: false,
      focusNodeId: null,
      highlightedNodeIds: new Set(),
      isGestureInteracting: false,
      isLayoutComputing: false,
      layoutError: createAppError({
        code: AppErrorCode.WORKER_UNAVAILABLE,
        kind: 'unsupported',
        source: 'character-graph',
        userMessageKey: 'errors.WORKER_UNAVAILABLE',
        debugMessage: 'Character graph layout worker is unavailable.',
      }),
      isPanning: false,
      layoutEdges: [],
      layoutMessage: null,
      layoutNodes: [],
      layoutProgress: 0,
      relatedEdges: [],
      selectedNode: null,
      selectedNodeId: null,
      stageHeight: 960,
      stageMeta: [],
      zoomState: {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      },
      clearSelection: vi.fn(),
      handleCanvasPointerDown: vi.fn(),
      handleNodeMouseEnter: vi.fn(),
      handleNodeMouseLeave: vi.fn(),
      handleNodePointerDown: vi.fn(),
      resetLayout: vi.fn(),
      selectNode: vi.fn(),
    });
  });

  it('shows the translated worker unavailable message in the stage chrome', async () => {
    renderPage();

    expect(await screen.findByText('Mock Novel')).toBeInTheDocument();
    expect(screen.getByText('errors.WORKER_UNAVAILABLE')).toBeInTheDocument();
  });
});
