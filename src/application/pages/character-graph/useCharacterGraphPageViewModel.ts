import type { CharacterGraphPageViewModel } from './types';
import type { CharacterGraphResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { refreshAnalysisOverview } from '@application/use-cases/analysis';
import { loadCharacterGraphPageData } from '@application/use-cases/character-graph';
import { appPaths } from '@shared/routing/appPaths';
import { useCharacterGraphCanvasController } from '@domains/character-graph';
import { reportAppError } from '@shared/debug';
import {
  AppErrorCode,
  toAppError,
  translateAppError,
} from '@shared/errors';

function isValidNovelId(novelId: number): boolean {
  return Number.isFinite(novelId) && novelId > 0;
}

function getIsMobileViewport(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

function createInvalidNovelError(): AppError {
  return toAppError('Invalid novel id', {
    code: AppErrorCode.NOVEL_NOT_FOUND,
    kind: 'not-found',
    source: 'character-graph',
    userMessageKey: 'characterGraph.loadError',
  });
}

export function useCharacterGraphPageViewModel(novelId: number): CharacterGraphPageViewModel {
  const { t } = useTranslation();
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const [novel, setNovel] = useState<NovelView | null>(null);
  const [graph, setGraph] = useState<CharacterGraphResponse | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [isRefreshingOverview, setIsRefreshingOverview] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<AppError | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(getIsMobileViewport);

  const canvas = useCharacterGraphCanvasController({ graph, isMobile, t });

  const loadData = useCallback(async (): Promise<void> => {
    if (!isValidNovelId(novelId)) {
      setNovel(null);
      setGraph(null);
      setError(createInvalidNovelError());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await loadCharacterGraphPageData(novelId);
      setNovel(data.novel);
      setGraph(data.graph);
    } catch (loadError) {
      const normalized = toAppError(loadError, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'character-graph',
        userMessageKey: 'characterGraph.loadError',
      });
      reportAppError(normalized);
      setError(normalized);
    } finally {
      setIsLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    loadData().catch(() => undefined);
  }, [loadData]);

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(Boolean(
        fullscreenRef.current && document.fullscreenElement === fullscreenRef.current,
      ));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    setIsFullscreen(Boolean(
      fullscreenRef.current && document.fullscreenElement === fullscreenRef.current,
    ));
  }, [isLoading]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent): void => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    if (!fullscreenRef.current) {
      return;
    }

    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen();
      } else {
        await fullscreenRef.current.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen request errors.
    }
  }, []);

  const canRefreshOverview = Boolean(
    graph
    && graph.meta.totalChapters > 0
    && graph.meta.analyzedChapters === graph.meta.totalChapters,
  );

  const refreshOverview = useCallback(async (): Promise<void> => {
    if (!canRefreshOverview || !isValidNovelId(novelId)) {
      return;
    }

    setIsRefreshingOverview(true);
    setActionMessage(null);
    setActionError(null);

    try {
      await refreshAnalysisOverview(novelId);
      setActionMessage(t('characterGraph.refreshStarted'));
    } catch (refreshError) {
      const normalized = toAppError(refreshError, {
        code: AppErrorCode.OVERVIEW_FAILED,
        kind: 'execution',
        source: 'character-graph',
        userMessageKey: 'characterGraph.refreshFailed',
      });
      reportAppError(normalized);
      setActionError(normalized);
    } finally {
      setIsRefreshingOverview(false);
    }
  }, [canRefreshOverview, novelId, t]);

  const actionBannerMessage = useMemo(() => {
    if (canvas.layout.error) {
      return translateAppError(canvas.layout.error, t, 'characterGraph.loadError');
    }

    if (actionError) {
      return translateAppError(actionError, t, 'characterGraph.refreshFailed');
    }

    return actionMessage;
  }, [actionError, actionMessage, canvas.layout.error, t]);

  return {
    actionBannerMessage,
    canvas,
    canRefreshOverview,
    error,
    errorBackHref: isValidNovelId(novelId) ? appPaths.novel(novelId) : appPaths.bookshelf(),
    fullscreenRef,
    graph,
    isFullscreen,
    isLoading,
    isMobile,
    isRefreshingOverview,
    novel,
    novelDetailHref: novel ? appPaths.novel(novel.id) : appPaths.bookshelf(),
    refreshOverview,
    toggleFullscreen,
  };
}
