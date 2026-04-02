import type { ReactNode } from 'react';
import type { AnalysisJobStatus, AnalysisStatusResponse, ChapterAnalysisResult } from '@shared/contracts';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface ReaderAnalysisBridgeController {
  analyzeChapter: (
    novelId: number,
    chapterIndex: number,
  ) => Promise<{ analysis: ChapterAnalysisResult | null }>;
  getChapterAnalysis: (
    novelId: number,
    chapterIndex: number,
  ) => Promise<{ analysis: ChapterAnalysisResult | null }>;
  getStatus: (novelId: number) => Promise<AnalysisStatusResponse>;
  renderSummaryPanel: (input: {
    analysis: ChapterAnalysisResult | null;
    isAnalyzingChapter: boolean;
    isLoading: boolean;
    job: AnalysisJobStatus | null;
    novelId: number;
    onAnalyzeChapter: () => void;
  }) => ReactNode;
}

export interface ReaderAnalysisBridgeState {
  analysisStatus: AnalysisStatusResponse | null;
  chapterAnalysis: ChapterAnalysisResult | null;
  isChapterAnalysisLoading: boolean;
  isAnalyzingChapter: boolean;
  handleAnalyzeChapter: () => void;
  summaryRestoreSignal: unknown;
  summaryPanel: ReactNode;
}

interface UseReaderAnalysisBridgeParams {
  chapterIndex: number;
  controller: ReaderAnalysisBridgeController;
  novelId: number;
  viewMode: 'original' | 'summary';
}

export function useReaderAnalysisBridge({
  chapterIndex,
  controller,
  novelId,
  viewMode,
}: UseReaderAnalysisBridgeParams): ReaderAnalysisBridgeState {
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [chapterAnalysis, setChapterAnalysis] = useState<ChapterAnalysisResult | null>(null);
  const [isChapterAnalysisLoading, setIsChapterAnalysisLoading] = useState(false);
  const [isAnalyzingChapter, setIsAnalyzingChapter] = useState(false);
  const chapterAnalysisCacheRef = useRef<Map<string, ChapterAnalysisResult | null>>(new Map());

  const loadAnalysisStatus = useCallback(async () => {
    if (!novelId) return;
    try {
      const data = await controller.getStatus(novelId);
      setAnalysisStatus(data);
    } catch {
      setAnalysisStatus(null);
    }
  }, [controller, novelId]);

  const loadChapterAnalysis = useCallback(async (silent = false) => {
    if (!novelId || chapterIndex < 0 || viewMode !== 'summary') return;

    const cacheKey = `${novelId}:${chapterIndex}`;
    const hasCachedAnalysis = chapterAnalysisCacheRef.current.has(cacheKey);
    const cachedAnalysis = chapterAnalysisCacheRef.current.get(cacheKey) ?? null;
    const hasUsableCache = hasCachedAnalysis && cachedAnalysis !== null;
    const shouldRefreshCachedAnalysis =
      analysisStatus?.job.status === 'running' || analysisStatus?.job.status === 'pausing';

    if (hasCachedAnalysis) {
      setChapterAnalysis(cachedAnalysis);
      if (hasUsableCache && !shouldRefreshCachedAnalysis) {
        setIsChapterAnalysisLoading(false);
        return;
      }
    }

    if (!silent && !hasUsableCache) setIsChapterAnalysisLoading(true);
    try {
      const data = await controller.getChapterAnalysis(novelId, chapterIndex);
      chapterAnalysisCacheRef.current.set(cacheKey, data.analysis);
      setChapterAnalysis(data.analysis);
    } catch {
      if (!hasCachedAnalysis) {
        setChapterAnalysis(null);
      }
    } finally {
      if (!silent && !hasUsableCache) setIsChapterAnalysisLoading(false);
    }
  }, [analysisStatus?.job.status, chapterIndex, controller, novelId, viewMode]);

  const handleAnalyzeChapter = useCallback(async () => {
    if (!novelId || chapterIndex < 0) return;
    setIsAnalyzingChapter(true);
    try {
      const result = await controller.analyzeChapter(novelId, chapterIndex);
      chapterAnalysisCacheRef.current.set(`${novelId}:${chapterIndex}`, result.analysis);
      setChapterAnalysis(result.analysis);
    } finally {
      setIsAnalyzingChapter(false);
    }
  }, [chapterIndex, controller, novelId]);

  useEffect(() => {
    if (!novelId) return;
    loadAnalysisStatus();
  }, [loadAnalysisStatus, novelId]);

  useEffect(() => {
    if (!novelId || chapterIndex < 0 || viewMode !== 'summary') return;
    loadChapterAnalysis();
  }, [chapterIndex, loadChapterAnalysis, novelId, viewMode]);

  useEffect(() => {
    const status = analysisStatus?.job.status;
    if (!novelId || (status !== 'running' && status !== 'pausing')) return;

    const timer = window.setInterval(() => {
      loadAnalysisStatus();
      loadChapterAnalysis(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisStatus?.job.status, loadAnalysisStatus, loadChapterAnalysis, novelId]);

  const summaryPanel = useMemo(() => {
    return controller.renderSummaryPanel({
      analysis: chapterAnalysis,
      isAnalyzingChapter,
      isLoading: isChapterAnalysisLoading,
      job: analysisStatus?.job ?? null,
      novelId,
      onAnalyzeChapter: handleAnalyzeChapter,
    });
  }, [
    analysisStatus?.job,
    chapterAnalysis,
    controller,
    handleAnalyzeChapter,
    isAnalyzingChapter,
    isChapterAnalysisLoading,
    novelId,
  ]);

  return {
    analysisStatus,
    chapterAnalysis,
    isChapterAnalysisLoading,
    isAnalyzingChapter,
    handleAnalyzeChapter,
    summaryRestoreSignal: chapterAnalysis,
    summaryPanel,
  };
}
