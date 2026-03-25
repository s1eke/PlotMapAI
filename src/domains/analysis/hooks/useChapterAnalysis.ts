import { useState, useEffect, useCallback, useRef } from 'react';
import { analysisApi } from '../api/analysisApi';
import type { AnalysisStatusResponse, ChapterAnalysisResult } from '../api/analysisApi';

export function useChapterAnalysis(novelId: number, chapterIndex: number) {
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [chapterAnalysis, setChapterAnalysis] = useState<ChapterAnalysisResult | null>(null);
  const [isChapterAnalysisLoading, setIsChapterAnalysisLoading] = useState(false);
  const [isAnalyzingChapter, setIsAnalyzingChapter] = useState(false);
  const chapterAnalysisCacheRef = useRef<Map<string, ChapterAnalysisResult | null>>(new Map());

  const loadAnalysisStatus = useCallback(async () => {
    if (!novelId) return;

    try {
      const data = await analysisApi.getStatus(novelId);
      setAnalysisStatus(data);
    } catch (err) {
      console.error('Failed to load analysis status', err);
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
      const data = await analysisApi.getChapterAnalysis(novelId, chapterIndex);
      chapterAnalysisCacheRef.current.set(cacheKey, data.analysis);
      setChapterAnalysis(data.analysis);
    } catch (err) {
      console.error('Failed to load chapter analysis', err);
      if (!hasCachedAnalysis) {
        setChapterAnalysis(null);
      }
    } finally {
      if (!silent && !hasUsableCache) setIsChapterAnalysisLoading(false);
    }
  }, [analysisStatus?.job.status, chapterIndex, novelId]);

  const handleAnalyzeChapter = useCallback(async () => {
    if (!novelId || chapterIndex < 0) return;
    setIsAnalyzingChapter(true);
    try {
      const result = await analysisApi.analyzeChapter(novelId, chapterIndex);
      chapterAnalysisCacheRef.current.set(`${novelId}:${chapterIndex}`, result.analysis);
      setChapterAnalysis(result.analysis);
    } catch (err) {
      console.error('Failed to analyze chapter', err);
    } finally {
      setIsAnalyzingChapter(false);
    }
  }, [chapterIndex, novelId]);

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
