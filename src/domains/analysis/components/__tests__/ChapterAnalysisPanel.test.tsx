import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChapterAnalysisPanel from '../ChapterAnalysisPanel';
import { MemoryRouter } from 'react-router-dom';
import type { AnalysisJobStatus, ChapterAnalysisResult } from '../../analysisService';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('ChapterAnalysisPanel', () => {
  it('shows loading state when isLoading is true', () => {
    const { container } = render(
      <MemoryRouter>
        <ChapterAnalysisPanel
          analysis={null}
          job={null}
          isLoading
          progressHref="/novel/1"
          settingsHref="/settings"
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders analysis results when provided', () => {
    const analysis: ChapterAnalysisResult = {
      chapterIndex: 0,
      chapterTitle: 'Test Chapter',
      summary: 'Test Summary',
      characters: [{ name: 'Alice', role: 'Protagonist', description: 'Hero', weight: 1.0 }],
      relationships: [],
      keyPoints: ['Point 1'],
      tags: ['Action'],
      chunkIndex: 0,
      updatedAt: null,
    };

    render(
      <MemoryRouter>
        <ChapterAnalysisPanel
          analysis={analysis}
          job={null}
          isLoading={false}
          progressHref="/novel/1"
          settingsHref="/settings"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Test Chapter')).toBeInTheDocument();
    expect(screen.getByText('Test Summary')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Point 1')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('renders job status when analysis is not complete', () => {
    const job: AnalysisJobStatus = {
      status: 'running' as const,
      currentStage: 'chapters' as const,
      completedChunks: 1,
      totalChunks: 3,
      analyzedChapters: 10,
      totalChapters: 30,
      currentChunkIndex: 0,
      progressPercent: 33,
      pauseRequested: false,
      lastError: '',
      analysisComplete: false,
      startedAt: null,
      completedAt: null,
      lastHeartbeat: null,
      updatedAt: null,
      currentChunk: {
        chunkIndex: 0,
        startChapterIndex: 0,
        endChapterIndex: 9,
        chapterIndices: [0, 1],
        status: 'running',
        chunkSummary: '',
        errorMessage: '',
        updatedAt: null,
      },
      canStart: false,
      canPause: true,
      canResume: false,
      canRestart: false,
    };

    render(
      <MemoryRouter>
        <ChapterAnalysisPanel
          analysis={null}
          job={job}
          isLoading={false}
          progressHref="/novel/1"
          settingsHref="/settings"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('reader.analysisPanel.statusQueued')).toBeInTheDocument();
  });
});
