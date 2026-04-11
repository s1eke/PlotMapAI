import { useState, useEffect, useCallback, useRef } from 'react';
import { reportAppError } from '@shared/debug';
import type { AnalysisStatusResponse, ChapterAnalysisResult } from '@shared/contracts';

import { AppErrorCode, toAppError } from '@shared/errors';
import { analysisService } from '../analysisService';

interface UseChapterAnalysisOptions {
  analyzeChapter?: (
    novelId: number,
    chapterIndex: number,
  ) => Promise<{ analysis: ChapterAnalysisResult | null }>;
}

export function useChapterAnalysis(
  novelId: number,
  chapterIndex: number,
  options: UseChapterAnalysisOptions = {},
) {
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [chapterAnalysis, setChapterAnalysis] = useState<ChapterAnalysisResult | null>(null);
  const [isChapterAnalysisLoading, setIsChapterAnalysisLoading] = useState(false);
  const [isAnalyzingChapter, setIsAnalyzingChapter] = useState(false);
  const chapterAnalysisCacheRef = useRef<Map<string, ChapterAnalysisResult | null>>(new Map());

  const loadAnalysisStatus = useCallback(async () => {
    if (!novelId) return;

    try {
      const data = await analysisService.getStatus(novelId);
      setAnalysisStatus(data);
    } catch (err) {
      reportAppError(toAppError(err, {
        code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
        kind: 'execution',
        source: 'analysis',
        userMessageKey: 'errors.ANALYSIS_EXECUTION_FAILED',
      }));
      setAnalysisStatus(null);
    }
  }, [novelId]);

  const loadChapterAnalysis = useCallback(async (silent = false) => {
    if (!novelId || chapterIndex < 0) return;

    const cacheKey = `${novelId}:${chapterIndex}`;
    const hasCachedAnalysis = chapterAnalysisCacheRef.current.has(cacheKey);
    const cachedAnalysis = chapterAnalysisCacheRef.current.get(cacheKey) ?? null;
    const hasUsableCache = hasCachedAnalysis && cachedAnalysis !== null;
    const shouldRefreshCachedAnalysis = analysisStatus?.job.status === 'running' || analysisStatus?.job.status === 'pausing';

    if (hasCachedAnalysis) {
      setChapterAnalysis(cachedAnalysis);
      if (hasUsableCache && !shouldRefreshCachedAnalysis) {
        setIsChapterAnalysisLoading(false);
        return;
      }
    }

    if (!silent && !hasUsableCache) setIsChapterAnalysisLoading(true);
    try {
      const data = await analysisService.getChapterAnalysis(novelId, chapterIndex);
      chapterAnalysisCacheRef.current.set(cacheKey, data.analysis);
      setChapterAnalysis(data.analysis);
    } catch (err) {
      reportAppError(toAppError(err, {
        code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
        kind: 'execution',
        source: 'analysis',
        userMessageKey: 'errors.ANALYSIS_EXECUTION_FAILED',
      }));
      if (!hasCachedAnalysis) {
        setChapterAnalysis(null);
      }
    } finally {
      if (!silent && !hasUsableCache) setIsChapterAnalysisLoading(false);
    }
  }, [analysisStatus?.job.status, chapterIndex, novelId]);

  const handleAnalyzeChapter = useCallback(async () => {
    if (!novelId || chapterIndex < 0 || !options.analyzeChapter) return;
    setIsAnalyzingChapter(true);
    try {
      const result = await options.analyzeChapter(novelId, chapterIndex);
      chapterAnalysisCacheRef.current.set(`${novelId}:${chapterIndex}`, result.analysis);
      setChapterAnalysis(result.analysis);
    } catch (err) {
      reportAppError(toAppError(err, {
        code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
        kind: 'execution',
        source: 'analysis',
        userMessageKey: 'errors.ANALYSIS_EXECUTION_FAILED',
      }));
    } finally {
      setIsAnalyzingChapter(false);
    }
  }, [chapterIndex, novelId, options]);

  useEffect(() => {
    if (!novelId) return;
    loadAnalysisStatus();
  }, [loadAnalysisStatus, novelId]);

  useEffect(() => {
    if (!novelId || chapterIndex < 0) return;
    loadChapterAnalysis();
  }, [chapterIndex, loadChapterAnalysis, novelId]);

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

  return {
    analysisStatus,
    chapterAnalysis,
    isChapterAnalysisLoading,
    isAnalyzingChapter,
    handleAnalyzeChapter,
  };
}
