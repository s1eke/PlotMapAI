import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('CharacterGraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(novelsApi.get).mockResolvedValue(novel);
    vi.mocked(analysisApi.getCharacterGraph).mockResolvedValue(graphResponse);
    vi.mocked(analysisApi.refreshOverview).mockResolvedValue({ job: { status: 'running' }, overview: null, chunks: [] } as never);
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
});
