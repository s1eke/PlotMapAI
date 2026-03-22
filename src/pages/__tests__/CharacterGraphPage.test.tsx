import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharacterGraphPage from '../CharacterGraphPage';
import { analysisApi } from '../../api/analysis';
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
  },
}));

vi.mock('../../api/analysis', () => ({
  analysisApi: {
    getCharacterGraph: vi.fn(),
    refreshOverview: vi.fn(),
  },
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
  chapter_count: 2,
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

const interactiveGraphResponse = {
  nodes: [
    graphResponse.nodes[0],
    {
      id: 'friend',
      name: 'Friend',
      role: 'support',
      description: 'Key ally',
      weight: 5,
      sharePercent: 25,
      chapterCount: 2,
      chapters: [0, 1],
      isCore: false,
    },
  ],
  edges: [
    {
      id: 'hero-friend',
      source: 'hero',
      target: 'friend',
      type: 'ally',
      relationTags: ['ally'],
      description: 'Trusted ally',
      weight: 12,
      mentionCount: 4,
      chapterCount: 2,
      chapters: [0, 1],
    },
  ],
  meta: {
    ...graphResponse.meta,
    nodeCount: 2,
    edgeCount: 1,
  },
};

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>bookshelf-home</div>} />
        <Route path="/novel/:id/graph" element={<CharacterGraphPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function mockSvgBoundingRect() {
  return vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    top: 0,
    right: 100,
    bottom: 100,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('CharacterGraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(novelsApi.get).mockResolvedValue(novel);
    vi.mocked(analysisApi.getCharacterGraph).mockResolvedValue(graphResponse);
    vi.mocked(analysisApi.refreshOverview).mockResolvedValue({ job: { status: 'running' }, overview: null, chunks: [] } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an invalid-id error without calling the data APIs', async () => {
    renderPage('/novel/not-a-number/graph');

    expect(await screen.findByText('characterGraph.loadError')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'characterGraph.backToBook' })).toHaveAttribute('href', '/');
    expect(novelsApi.get).not.toHaveBeenCalled();
    expect(analysisApi.getCharacterGraph).not.toHaveBeenCalled();
  });

  it('renders the load failure state when graph data cannot be fetched', async () => {
    vi.mocked(analysisApi.getCharacterGraph).mockRejectedValue(new Error('graph load failed'));
    renderPage('/novel/1/graph');

    expect(await screen.findByText('graph load failed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'characterGraph.backToBook' })).toHaveAttribute('href', '/novel/1');
  });

  it('loads graph data and refreshes the overview when refresh is available', async () => {
    const user = userEvent.setup();
    renderPage('/novel/1/graph');

    expect(await screen.findByText('Mock Novel')).toBeInTheDocument();
    expect(screen.getByText('characterGraph.canvasHint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'characterGraph.refreshGraph' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'characterGraph.refreshGraph' }));

    expect(analysisApi.refreshOverview).toHaveBeenCalledWith(1);
    expect(await screen.findByText('characterGraph.refreshStarted')).toBeInTheDocument();
  });

  it('opens and closes the character inspector when a node is selected', async () => {
    const rectSpy = mockSvgBoundingRect();
    vi.mocked(analysisApi.getCharacterGraph).mockResolvedValueOnce(interactiveGraphResponse);
    const { container } = renderPage('/novel/1/graph');

    expect(await screen.findByText('Mock Novel')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText('Hero'), { clientX: 50, clientY: 50 });

    expect(await screen.findByText('characterGraph.profileTitle')).toBeInTheDocument();

    const closeButton = Array.from(container.querySelectorAll('button')).find((button) => button.className.includes('h-10 w-10'));
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);

    await waitFor(() => {
      expect(screen.queryByText('characterGraph.profileTitle')).not.toBeInTheDocument();
    });

    rectSpy.mockRestore();
  });

  it('resets the canvas zoom transform when layout reset is triggered', async () => {
    const user = userEvent.setup();
    const rectSpy = mockSvgBoundingRect();
    const { container } = renderPage('/novel/1/graph');

    expect(await screen.findByText('Mock Novel')).toBeInTheDocument();

    const svg = container.querySelector('svg[viewBox="0 0 1440 960"]');
    const matrixGroup = svg?.querySelector('g[transform^="matrix("]');

    expect(svg).not.toBeNull();
    expect(matrixGroup).not.toBeNull();
    expect(matrixGroup).toHaveAttribute('transform', 'matrix(1 0 0 1 0 0)');

    fireEvent.wheel(svg!, { clientX: 50, clientY: 50, deltaY: -300 });

    await waitFor(() => {
      expect(matrixGroup).not.toHaveAttribute('transform', 'matrix(1 0 0 1 0 0)');
    });

    await user.click(screen.getByRole('button', { name: 'characterGraph.resetLayout' }));

    await waitFor(() => {
      expect(matrixGroup).toHaveAttribute('transform', 'matrix(1 0 0 1 0 0)');
    });

    rectSpy.mockRestore();
  });

  it('shows the partial hint while keeping refresh available for incomplete graph metadata', async () => {
    vi.mocked(analysisApi.getCharacterGraph).mockResolvedValueOnce({
      ...graphResponse,
      meta: {
        ...graphResponse.meta,
        isComplete: false,
      },
    });

    renderPage('/novel/1/graph');

    expect(await screen.findByText('characterGraph.partialHint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'characterGraph.refreshGraph' })).toBeInTheDocument();
  });
});
