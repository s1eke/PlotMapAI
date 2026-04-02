import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { refreshAnalysisOverview } from '@application/use-cases/analysis';
import { loadCharacterGraphPageData } from '@application/use-cases/library';
import { appPaths } from '@app/router/paths';
import { reportAppError } from '@app/debug/service';
import type { CharacterGraphResponse } from '@shared/contracts';
import CharacterGraphStage from '@domains/character-graph/components/characterGraph/CharacterGraphStage';
import { useCharacterGraphCanvas } from '@domains/character-graph/hooks/useCharacterGraphCanvas';
import type { NovelView } from '@domains/library';
import {
  AppErrorCode,
  toAppError,
  translateAppError,
  type AppError,
} from '@shared/errors';

function getIsMobileViewport(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

export default function CharacterGraphPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);
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

  const canvas = useCharacterGraphCanvas({ graph, isLoading, isMobile, t });

  const loadData = useCallback(async () => {
    if (!Number.isFinite(novelId) || novelId <= 0) {
      setError(toAppError('Invalid novel id', {
        code: AppErrorCode.NOVEL_NOT_FOUND,
        kind: 'not-found',
        source: 'character-graph',
        userMessageKey: 'characterGraph.loadError',
      }));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await loadCharacterGraphPageData(novelId);
      setNovel(data.novel);
      setGraph(data.graph);
    } catch (err) {
      const normalized = toAppError(err, {
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
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(
        fullscreenRef.current && document.fullscreenElement === fullscreenRef.current,
      ));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    setIsFullscreen(Boolean(
      fullscreenRef.current && document.fullscreenElement === fullscreenRef.current,
    ));
  }, [isLoading]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!fullscreenRef.current) return;
    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen();
      } else {
        await fullscreenRef.current.requestFullscreen();
      }
    } catch {
      // ignore fullscreen request errors
    }
  }, []);

  const canRefreshOverview = Boolean(
    graph
    && graph.meta.totalChapters > 0
    && graph.meta.analyzedChapters === graph.meta.totalChapters,
  );

  const handleRefreshOverview = useCallback(async () => {
    if (!canRefreshOverview || !novelId) return;
    setIsRefreshingOverview(true);
    setActionMessage(null);
    setActionError(null);
    try {
      await refreshAnalysisOverview(novelId);
      setActionMessage(t('characterGraph.refreshStarted'));
    } catch (err) {
      const normalized = toAppError(err, {
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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#f5f2eb]">
        <Loader2 className="h-8 w-8 animate-spin text-[#34527a]" />
      </div>
    );
  }

  if (error || !novel || !graph) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#f5f2eb] p-8 text-center">
        <p className="text-[#8f4c42]">
          {error ? translateAppError(error, t, 'characterGraph.loadError') : t('characterGraph.loadError')}
        </p>
        <Link
          to={novelId > 0 ? appPaths.novel(novelId) : appPaths.bookshelf()}
          className="inline-flex items-center gap-2 text-[#5f6b79] transition hover:text-[#18202a]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('characterGraph.backToBook')}
        </Link>
      </div>
    );
  }

  if (!graph.meta.hasData) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-[#f5f2eb] px-6 py-8">
        <div className="max-w-xl rounded-[32px] border border-[#d9d3c7] bg-[#fffdfa] p-10 text-center shadow-[0_24px_70px_rgba(28,35,45,0.07)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef1f4] text-[#34527a]">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-3xl font-semibold text-[#18202a]">{t('characterGraph.empty')}</h2>
          <p className="mt-3 text-[#6b7563]">{t('characterGraph.emptyHint')}</p>
          <Link
            to={appPaths.novel(novel.id)}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#d9d3c7] bg-white px-5 py-3 text-sm font-medium text-[#18202a] transition hover:border-[#34527a]/20 hover:text-[#34527a]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('characterGraph.openBookDetail')}
          </Link>
        </div>
      </div>
    );
  }

  let actionBannerMessage = actionMessage;
  if (canvas.layoutError) {
    actionBannerMessage = translateAppError(canvas.layoutError, t, 'characterGraph.loadError');
  } else if (actionError) {
    actionBannerMessage = translateAppError(actionError, t, 'characterGraph.refreshFailed');
  }

  return (
    <CharacterGraphStage
      fullscreenRef={fullscreenRef}
      actionMessage={actionBannerMessage}
      canPanCanvas={canvas.canPanCanvas}
      canRefreshOverview={canRefreshOverview}
      focusNodeId={canvas.focusNodeId}
      graphGeneratedAt={graph.meta.generatedAt}
      highlightedNodeIds={canvas.highlightedNodeIds}
      isComplete={graph.meta.isComplete}
      isFullscreen={isFullscreen}
      isGestureInteracting={canvas.isGestureInteracting}
      isLayoutComputing={canvas.isLayoutComputing}
      isMobile={isMobile}
      isPanning={canvas.isPanning}
      isRefreshingOverview={isRefreshingOverview}
      layoutEdges={canvas.layoutEdges}
      layoutMessage={canvas.layoutMessage}
      layoutNodes={canvas.layoutNodes}
      layoutProgress={canvas.layoutProgress}
      novelId={novel.id}
      novelTitle={novel.title}
      relatedEdges={canvas.relatedEdges}
      selectedNode={canvas.selectedNode}
      selectedNodeId={canvas.selectedNodeId}
      stageHeight={canvas.stageHeight}
      stageMeta={canvas.stageMeta}
      zoomState={canvas.zoomState}
      svgRef={canvas.svgRef}
      onCanvasPointerDown={canvas.handleCanvasPointerDown}
      onClearSelection={canvas.clearSelection}
      onNodeMouseEnter={canvas.handleNodeMouseEnter}
      onNodeMouseLeave={canvas.handleNodeMouseLeave}
      onNodePointerDown={canvas.handleNodePointerDown}
      onRefreshOverview={handleRefreshOverview}
      onResetLayout={canvas.resetLayout}
      onSelectNode={canvas.selectNode}
      onToggleFullscreen={toggleFullscreen}
    />
  );
}
