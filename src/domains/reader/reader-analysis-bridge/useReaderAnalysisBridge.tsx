import type { ReactNode } from 'react';

import { useMemo } from 'react';

import { useChapterAnalysis } from '@domains/analysis';

import ReaderAnalysisPanelBridge from './ReaderAnalysisPanelBridge';

export interface ReaderAnalysisBridgeState {
  analysisStatus: ReturnType<typeof useChapterAnalysis>['analysisStatus'];
  chapterAnalysis: ReturnType<typeof useChapterAnalysis>['chapterAnalysis'];
  isChapterAnalysisLoading: boolean;
  isAnalyzingChapter: boolean;
  handleAnalyzeChapter: () => void;
  summaryRestoreSignal: unknown;
  summaryPanel: ReactNode;
}

interface UseReaderAnalysisBridgeParams {
  novelId: number;
  chapterIndex: number;
  viewMode: 'original' | 'summary';
}

export function useReaderAnalysisBridge({
  novelId,
  chapterIndex,
  viewMode,
}: UseReaderAnalysisBridgeParams): ReaderAnalysisBridgeState {
  const analysis = useChapterAnalysis(
    novelId,
    viewMode === 'summary' ? chapterIndex : -1,
  );

  const summaryPanel = useMemo(() => (
    <ReaderAnalysisPanelBridge
      novelId={novelId}
      analysis={analysis.chapterAnalysis}
      job={analysis.analysisStatus?.job ?? null}
      isLoading={analysis.isChapterAnalysisLoading}
      isAnalyzingChapter={analysis.isAnalyzingChapter}
      onAnalyzeChapter={analysis.handleAnalyzeChapter}
    />
  ), [
    analysis.analysisStatus?.job,
    analysis.chapterAnalysis,
    analysis.handleAnalyzeChapter,
    analysis.isAnalyzingChapter,
    analysis.isChapterAnalysisLoading,
    novelId,
  ]);

  return {
    ...analysis,
    isChapterAnalysisLoading: analysis.isChapterAnalysisLoading,
    summaryRestoreSignal: analysis.chapterAnalysis,
    summaryPanel,
  };
}
