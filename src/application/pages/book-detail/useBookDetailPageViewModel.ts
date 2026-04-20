import type { TFunction } from 'i18next';
import type { AnalysisJobStatus, AnalysisStatusResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
  loadBookDetailAnalysisStatus,
  loadBookDetailPageData,
} from '@application/use-cases/book-detail';
import { appPaths } from '@shared/routing/appPaths';
import { useNovelCoverResource } from '@domains/library';
import { reportAppError } from '@shared/debug';
import { AppErrorCode, toAppError } from '@shared/errors';

import type {
  BookDetailContentSummary,
  BookDetailPageViewModel,
  BookDetailParagraph,
} from './types';
import { useBookDetailAnalysisController } from './useBookDetailAnalysisController';
import { useBookDetailDeleteFlow } from './useBookDetailDeleteFlow';

function isValidNovelId(novelId: number): boolean {
  return Number.isFinite(novelId) && novelId > 0;
}

function buildIntroParagraphs(introText: string): BookDetailParagraph[] {
  let cursor = 0;

  return introText.split('\n').map((paragraph) => {
    const key = `${cursor}:${paragraph}`;
    cursor += paragraph.length + 1;

    return {
      key,
      paragraph,
    };
  });
}

function getBookDetailJobStatusLabel(
  job: AnalysisJobStatus | null,
  t: TFunction,
): string {
  const isJobRunning = job?.status === 'running' || job?.status === 'pausing';

  if (!job) {
    return t('bookDetail.analysisStatusIdle');
  }
  if (job.analysisComplete) {
    return t('bookDetail.analysisStatusCompleted');
  }
  if (job.currentStage === 'overview' && isJobRunning) {
    return t('bookDetail.analysisStatusGeneratingOverview');
  }

  switch (job.status) {
    case 'running':
      return t('bookDetail.analysisStatusRunning');
    case 'pausing':
      return t('bookDetail.analysisStatusPausing');
    case 'paused':
      return t('bookDetail.analysisStatusPaused');
    case 'failed':
      return t('bookDetail.analysisStatusFailed');
    case 'completed':
      return t('bookDetail.analysisStatusPending');
    default:
      return t('bookDetail.analysisStatusIdle');
  }
}

function createInvalidNovelError(): AppError {
  return toAppError('Invalid novel id', {
    code: AppErrorCode.NOVEL_NOT_FOUND,
    kind: 'not-found',
    source: 'library',
    userMessageKey: 'bookDetail.notFound',
  });
}

function createEmptyContentSummary(): BookDetailContentSummary {
  return {
    contentFormat: 'rich',
    contentVersion: null,
    importFormatVersion: null,
    lastParsedAt: null,
  };
}

export function useBookDetailPageViewModel(novelId: number): BookDetailPageViewModel {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [novel, setNovel] = useState<NovelView | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [analysisStatusError, setAnalysisStatusError] = useState<AppError | null>(null);
  const [contentSummary, setContentSummary] = useState<BookDetailContentSummary>(
    createEmptyContentSummary,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const coverUrl = useNovelCoverResource(novel?.id ?? 0, Boolean(novel?.hasCover));

  const loadData = useCallback(async (): Promise<void> => {
    if (!isValidNovelId(novelId)) {
      setNovel(null);
      setAnalysisStatus(null);
      setAnalysisStatusError(null);
      setContentSummary(createEmptyContentSummary());
      setError(createInvalidNovelError());
      setIsLoading(false);
      setIsAnalysisLoading(false);
      return;
    }

    setIsLoading(true);
    setIsAnalysisLoading(true);
    setError(null);

    try {
      const data = await loadBookDetailPageData(novelId);
      setNovel(data.novel);
      setAnalysisStatus(data.analysisStatus);
      setAnalysisStatusError(data.analysisStatusError);
      setContentSummary(data.contentSummary);
      if (data.analysisStatusError) {
        reportAppError(data.analysisStatusError);
      }
    } catch (loadError) {
      const normalized = toAppError(loadError, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'library',
        userMessageKey: 'bookDetail.loadError',
      });
      reportAppError(normalized);
      setError(normalized);
      setNovel(null);
      setAnalysisStatus(null);
      setAnalysisStatusError(null);
      setContentSummary(createEmptyContentSummary());
    } finally {
      setIsLoading(false);
      setIsAnalysisLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-scroll-container="true"]');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      return;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [novelId]);

  const refreshAnalysisStatus = useCallback(async (silent = false): Promise<void> => {
    if (!isValidNovelId(novelId)) {
      return;
    }

    if (!silent) {
      setIsAnalysisLoading(true);
    }

    const nextState = await loadBookDetailAnalysisStatus(novelId);
    if (nextState.analysisStatusError) {
      reportAppError(nextState.analysisStatusError);
      setAnalysisStatusError(nextState.analysisStatusError);
      if (!silent) {
        setIsAnalysisLoading(false);
      }
      return;
    }

    setAnalysisStatus(nextState.analysisStatus);
    setAnalysisStatusError(null);
    if (!silent) {
      setIsAnalysisLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    const status = analysisStatus?.job.status;
    if (!isValidNovelId(novelId) || (status !== 'running' && status !== 'pausing')) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshAnalysisStatus(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisStatus?.job.status, novelId, refreshAnalysisStatus]);

  const updateAnalysisStatus = useCallback((nextStatus: AnalysisStatusResponse | null): void => {
    setAnalysisStatus(nextStatus);
    setAnalysisStatusError(null);
    setIsAnalysisLoading(false);
  }, []);

  const job = analysisStatus?.job ?? null;
  const overview = analysisStatus?.overview ?? null;
  const isJobRunning = job?.status === 'running' || job?.status === 'pausing';
  const introText = overview?.bookIntro || novel?.description || '';
  const introParagraphs = useMemo(() => buildIntroParagraphs(introText), [introText]);
  const characterChartData = useMemo(
    () => (overview?.characterStats ?? []).slice(0, 5),
    [overview],
  );
  const jobStatusLabel = useMemo(
    () => getBookDetailJobStatusLabel(job, t),
    [job, t],
  );
  const pageHrefs = useMemo(() => ({
    bookshelf: appPaths.bookshelf(),
    characterGraph: appPaths.characterGraph(novelId),
    reader: appPaths.reader(novelId),
  }), [novelId]);
  const analysisController = useBookDetailAnalysisController({
    job,
    novelId,
    onStatusUpdated: updateAnalysisStatus,
  });
  const deleteFlow = useBookDetailDeleteFlow({
    novelId,
    novelTitle: novel?.title ?? '',
    onDeleted: () => {
      navigate(appPaths.bookshelf(), { replace: true });
    },
  });

  return {
    analysisController,
    analysisStatus,
    analysisStatusError,
    characterChartData,
    contentSummary,
    coverUrl,
    deleteFlow,
    error,
    introParagraphs,
    introText,
    isAnalysisLoading,
    isJobRunning,
    isLoading,
    job,
    jobStatusLabel,
    novel,
    overview,
    pageHrefs,
  };
}
