import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { analyzeChapter } from '@application/use-cases/analysis';

import ReaderPage from '../ReaderPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@application/use-cases/analysis', () => ({
  analyzeChapter: vi.fn(),
}));

vi.mock('@domains/analysis', async () => {
  const actual = await vi.importActual<typeof import('@domains/analysis')>('@domains/analysis');
  return {
    ...actual,
    analysisService: {
      getChapterAnalysis: vi.fn(),
      getStatus: vi.fn(),
    },
  };
});

vi.mock('@domains/reader/pages/reader-page/ReaderContext', () => ({
  ReaderProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@domains/reader/pages/reader-page/ReaderPageContainer', () => ({
  default: ({
    analysisController,
    novelId,
  }: {
    analysisController: {
      analyzeChapter: (nextNovelId: number, chapterIndex: number) => Promise<unknown>;
      renderSummaryPanel: (input: {
        analysis: null;
        isAnalyzingChapter: boolean;
        isLoading: boolean;
        job: null;
        novelId: number;
        onAnalyzeChapter: () => void;
      }) => ReactNode;
    };
    novelId: number;
  }) => {
    return (
      <div>
        {analysisController.renderSummaryPanel({
          analysis: null,
          isAnalyzingChapter: false,
          isLoading: false,
          job: null,
          novelId,
          onAnalyzeChapter: () => {
            analysisController.analyzeChapter(novelId, 0).catch(() => undefined);
          },
        })}
      </div>
    );
  },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novel/1/read']}>
      <Routes>
        <Route path="/novel/:id/read" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('application ReaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeChapter).mockResolvedValue({
      analysis: {
        chapterIndex: 0,
        chapterTitle: 'Chapter 1',
        characters: [],
        chunkIndex: 0,
        keyPoints: ['point'],
        relationships: [],
        summary: 'summary',
        tags: ['tag'],
        updatedAt: null,
      },
    });
  });

  it('wires the summary panel analyze action through the application use-case', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'reader.analysisPanel.analyzeChapter' }));

    expect(analyzeChapter).toHaveBeenCalledWith(1, 0);
  });
});
