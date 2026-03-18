import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Maximize2, Minimize2, RefreshCw, RotateCcw, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { analysisApi } from '../api/analysis';
import type { CharacterGraphEdge, CharacterGraphNode, CharacterGraphResponse } from '../api/analysis';
import { novelsApi } from '../api/novels';
import type { Novel } from '../api/novels';

type LayoutNode = CharacterGraphNode & {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  radius: number;
  degree: number;
  score: number;
};

type LayoutEdge = CharacterGraphEdge & {
  path: string;
  labelX: number;
  labelY: number;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  radius: number;
};

type ZoomState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type PanState = {
  startX: number;
  startY: number;
  originOffsetX: number;
  originOffsetY: number;
  moved: boolean;
};

const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 960;
const CANVAS_PADDING = 96;
const MIN_ZOOM_SCALE = 0.72;
const MAX_ZOOM_SCALE = 2.4;
const DEFAULT_ZOOM_STATE: ZoomState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export default function CharacterGraphPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const panStateRef = useRef<PanState | null>(null);

  const [novel, setNovel] = useState<Novel | null>(null);
  const [graph, setGraph] = useState<CharacterGraphResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [zoomState, setZoomState] = useState<ZoomState>(DEFAULT_ZOOM_STATE);
  const [isPanning, setIsPanning] = useState(false);
  const [isRefreshingOverview, setIsRefreshingOverview] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!Number.isFinite(novelId) || novelId <= 0) {
      setError(t('characterGraph.loadError'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [novelData, graphData] = await Promise.all([
        novelsApi.get(novelId),
        analysisApi.getCharacterGraph(novelId),
      ]);
      setNovel(novelData);
      setGraph(graphData);
      setSelectedNodeId((current) => (
        current && graphData.nodes.some((node) => node.id === current) ? current : null
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('characterGraph.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [novelId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(fullscreenRef.current && document.fullscreenElement === fullscreenRef.current));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    setIsFullscreen(Boolean(fullscreenRef.current && document.fullscreenElement === fullscreenRef.current));
  }, [isLoading]);

  const baseNodes = useMemo(
    () => buildSpaciousLayout(graph?.nodes ?? [], graph?.edges ?? []),
    [graph?.nodes, graph?.edges],
  );

  useEffect(() => {
    setNodePositions((current) => {
      const next: Record<string, { x: number; y: number }> = {};
      baseNodes.forEach((node) => {
        next[node.id] = current[node.id] ?? { x: node.x, y: node.y };
      });
      return next;
    });
  }, [baseNodes]);

  const layoutNodes = useMemo(
    () => baseNodes.map((node) => ({
      ...node,
      x: nodePositions[node.id]?.x ?? node.x,
      y: nodePositions[node.id]?.y ?? node.y,
    })),
    [baseNodes, nodePositions],
  );

  const positionMap = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes]);

  const selectedNode = useMemo(
    () => layoutNodes.find((node) => node.id === selectedNodeId) ?? null,
    [layoutNodes, selectedNodeId],
  );

  const focusNodeId = hoveredNodeId ?? selectedNodeId ?? null;

  const relatedEdges = useMemo(() => {
    if (!selectedNode || !graph) return [];
    return graph.edges
      .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
      .sort((a, b) => b.weight - a.weight || b.mentionCount - a.mentionCount);
  }, [graph, selectedNode]);

  const highlightedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!focusNodeId || !graph) return ids;
    ids.add(focusNodeId);
    graph.edges.forEach((edge) => {
      if (edge.source === focusNodeId || edge.target === focusNodeId) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    });
    return ids;
  }, [focusNodeId, graph]);

  const layoutEdges = useMemo(() => {
    if (!graph) return [];
    return graph.edges
      .map((edge, index) => {
        const source = positionMap.get(edge.source);
        const target = positionMap.get(edge.target);
        if (!source || !target) return null;
        const { path, labelX, labelY } = buildEdgeCurve(source, target, index);
        return {
          ...edge,
          path,
          labelX,
          labelY,
        } satisfies LayoutEdge;
      })
      .filter((edge): edge is LayoutEdge => Boolean(edge));
  }, [graph, positionMap]);

  const stageMeta = useMemo(() => {
    if (!graph) return [];
    const progressPercent = graph.meta.totalChapters > 0
      ? Math.round((graph.meta.analyzedChapters / graph.meta.totalChapters) * 100)
      : 0;
    return [
      t('characterGraph.metaProgress', { percent: progressPercent }),
      t('characterGraph.metaCharacters', { count: graph.meta.nodeCount }),
      t('characterGraph.metaRelationships', { count: graph.meta.edgeCount }),
    ];
  }, [graph, t]);

  const canPanCanvas = zoomState.scale !== DEFAULT_ZOOM_STATE.scale
    || zoomState.offsetX !== DEFAULT_ZOOM_STATE.offsetX
    || zoomState.offsetY !== DEFAULT_ZOOM_STATE.offsetY;
  const canRefreshOverview = Boolean(graph && graph.meta.totalChapters > 0 && graph.meta.analyzedChapters === graph.meta.totalChapters);

  const resetLayout = useCallback(() => {
    setNodePositions(
      Object.fromEntries(baseNodes.map((node) => [node.id, { x: node.x, y: node.y }])),
    );
    setZoomState(DEFAULT_ZOOM_STATE);
  }, [baseNodes]);

  const getViewportPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * STAGE_WIDTH,
      y: ((clientY - rect.top) / rect.height) * STAGE_HEIGHT,
    };
  }, []);

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const viewportPoint = getViewportPoint(clientX, clientY);
    if (!viewportPoint) return null;
    return viewportPointToGraphPoint(viewportPoint, zoomState);
  }, [getViewportPoint, zoomState]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (drag) {
        const point = getSvgPoint(event.clientX, event.clientY);
        if (!point) return;
        setNodePositions((current) => ({
          ...current,
          [drag.nodeId]: {
            x: clamp(point.x - drag.offsetX, CANVAS_PADDING + drag.radius, STAGE_WIDTH - CANVAS_PADDING - drag.radius),
            y: clamp(point.y - drag.offsetY, CANVAS_PADDING + drag.radius, STAGE_HEIGHT - CANVAS_PADDING - drag.radius),
          },
        }));
        return;
      }

      const pan = panStateRef.current;
      if (!pan) return;
      const viewportPoint = getViewportPoint(event.clientX, event.clientY);
      if (!viewportPoint) return;
      const deltaX = viewportPoint.x - pan.startX;
      const deltaY = viewportPoint.y - pan.startY;
      if (!pan.moved && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
        pan.moved = true;
      }
      setZoomState((current) => {
        const nextOffset = clampZoomOffset(
          current.scale,
          pan.originOffsetX + deltaX,
          pan.originOffsetY + deltaY,
        );
        if (nextOffset.offsetX === current.offsetX && nextOffset.offsetY === current.offsetY) {
          return current;
        }
        return {
          ...current,
          ...nextOffset,
        };
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      const pan = panStateRef.current;
      if (pan && !pan.moved) {
        setSelectedNodeId(null);
      }
      panStateRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [getSvgPoint, getViewportPoint]);

  const handleNodePointerDown = useCallback((event: React.PointerEvent<SVGGElement>, node: LayoutNode) => {
    const point = getSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    dragStateRef.current = {
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      radius: node.radius,
    };
    setSelectedNodeId(node.id);
    setHoveredNodeId(node.id);
    event.stopPropagation();
    event.preventDefault();
  }, [getSvgPoint]);

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    const viewportPoint = getViewportPoint(event.clientX, event.clientY);
    if (!viewportPoint) return;

    event.preventDefault();
    setZoomState((current) => {
      const nextScale = clamp(
        Number((current.scale * Math.exp(-event.deltaY * 0.0015)).toFixed(4)),
        MIN_ZOOM_SCALE,
        MAX_ZOOM_SCALE,
      );
      if (nextScale === current.scale) {
        return current;
      }

      const graphPoint = viewportPointToGraphPoint(viewportPoint, current);
      const nextOffset = clampZoomOffset(
        nextScale,
        viewportPoint.x - graphPoint.x * nextScale,
        viewportPoint.y - graphPoint.y * nextScale,
      );
      return {
        scale: nextScale,
        ...nextOffset,
      };
    });
  }, [getViewportPoint]);

  const handleCanvasPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    dragStateRef.current = null;
    if (!canPanCanvas) {
      setSelectedNodeId(null);
      return;
    }

    const viewportPoint = getViewportPoint(event.clientX, event.clientY);
    if (!viewportPoint) {
      setSelectedNodeId(null);
      return;
    }

    panStateRef.current = {
      startX: viewportPoint.x,
      startY: viewportPoint.y,
      originOffsetX: zoomState.offsetX,
      originOffsetY: zoomState.offsetY,
      moved: false,
    };
    setIsPanning(true);
    event.preventDefault();
  }, [canPanCanvas, getViewportPoint, zoomState.offsetX, zoomState.offsetY]);

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

  const handleRefreshOverview = useCallback(async () => {
    if (!canRefreshOverview || !novelId) return;
    setIsRefreshingOverview(true);
    setActionMessage(null);
    try {
      await analysisApi.refreshOverview(novelId);
      setActionMessage(t('characterGraph.refreshStarted'));
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : t('characterGraph.refreshFailed'));
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
        <p className="text-[#8f4c42]">{error || t('characterGraph.loadError')}</p>
        <Link
          to={novelId > 0 ? `/novel/${novelId}` : '/'}
          className="inline-flex items-center gap-2 text-[#5f6b79] transition hover:text-[#18202a]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('characterGraph.backToBook')}
        </Link>
      </div>
    );
  }

  const hasGraphData = graph.meta.hasData;
  const canvasHeightClass = isFullscreen ? 'h-screen' : 'h-[calc(100vh-4rem)]';

  if (!hasGraphData) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-[#f5f2eb] px-6 py-8">
        <div className="max-w-xl rounded-[32px] border border-[#d9d3c7] bg-[#fffdfa] p-10 text-center shadow-[0_24px_70px_rgba(28,35,45,0.07)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef1f4] text-[#34527a]">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-3xl font-semibold text-[#18202a]">{t('characterGraph.empty')}</h2>
          <p className="mt-3 text-[#6b7563]">{t('characterGraph.emptyHint')}</p>
          <Link
            to={`/novel/${novel.id}`}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#d9d3c7] bg-white px-5 py-3 text-sm font-medium text-[#18202a] transition hover:border-[#34527a]/20 hover:text-[#34527a]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('characterGraph.openBookDetail')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden bg-[#f5f2eb] text-[#18202a]">
      <div ref={fullscreenRef} className={`relative w-full overflow-hidden ${canvasHeightClass}`}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#fcfbf8_0%,#f5f2eb_100%)]" />
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(113,120,129,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(113,120,129,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,82,122,0.06),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(24,32,42,0.04),transparent_34%)]" />

        <div className="absolute left-4 top-4 z-20 flex max-w-[min(62rem,calc(100%-2rem))] flex-wrap items-center gap-3 md:left-6 md:top-6">
          <Link
            to={`/novel/${novel.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('characterGraph.backToBook')}
          </Link>
          <div className="rounded-full border border-[#ddd7cc] bg-[#fffdfa]/96 px-4 py-2 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#34527a]">{t('characterGraph.title')}</p>
            <p className="mt-1 text-xs text-[#18202a] md:text-sm">{novel.title}</p>
          </div>
          <div className="hidden rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#697384] backdrop-blur lg:block">
            {t('characterGraph.canvasHint')}
          </div>
        </div>

        <div className="absolute right-4 top-4 z-20 flex max-w-[min(36rem,calc(100%-2rem))] flex-wrap justify-end gap-2 md:right-6 md:top-6">
          {stageMeta.map((item) => (
            <StatusPill key={item} text={item} />
          ))}
          <StatusPill text={graph.meta.isComplete ? t('characterGraph.metaComplete') : t('characterGraph.metaPartial')} accent />
          {graph.meta.generatedAt && <StatusPill text={t('characterGraph.metaGeneratedAt', { time: new Date(graph.meta.generatedAt).toLocaleString() })} />}
          {canRefreshOverview && (
            <button
              type="button"
              onClick={handleRefreshOverview}
              disabled={isRefreshingOverview}
              className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a] disabled:opacity-60"
            >
              {isRefreshingOverview ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('characterGraph.refreshGraph')}
            </button>
          )}
          <button
            type="button"
            onClick={resetLayout}
            className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a]"
          >
            <RotateCcw className="h-4 w-4" />
            {t('characterGraph.resetLayout')}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-2 rounded-full border border-[#ddd7cc] bg-[#fffdfa]/94 px-4 py-2 text-xs text-[#5f6b79] backdrop-blur transition hover:border-[#cfc7b9] hover:text-[#18202a]"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen ? t('characterGraph.exitFullscreen') : t('characterGraph.enterFullscreen')}
          </button>
        </div>

        <div className="absolute bottom-4 left-4 z-20 max-w-[min(28rem,calc(100%-2rem))] rounded-[22px] border border-[#ddd7cc] bg-[#fffdfa]/96 p-4 text-xs text-[#697384] shadow-[0_18px_45px_rgba(28,35,45,0.07)] backdrop-blur md:bottom-6 md:left-6">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#34527a]">
            <span className="rounded-full bg-[#eef1f4] px-3 py-1">{t('characterGraph.legendCore')}</span>
            <span className="rounded-full bg-[#f4f2ed] px-3 py-1 text-[#697384]">{t('characterGraph.legendRelation')}</span>
          </div>
          <p className="mt-3 leading-6">{t('characterGraph.dragHint')}</p>
          {actionMessage && (
            <div className="mt-3 rounded-2xl border border-[#d7deea] bg-[#f8fafc] px-3 py-2 text-[#5f6b79]">
              {actionMessage}
            </div>
          )}
          {!graph.meta.isComplete && (
            <div className="mt-3 flex gap-2 rounded-2xl border border-[#ffd6a5] bg-[#fff5e8] px-3 py-2 text-[#a06528]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('characterGraph.partialHint')}</span>
            </div>
          )}
        </div>

        {selectedNode && (
          <div className="absolute bottom-4 right-4 z-20 flex h-[min(42rem,calc(100%-2rem))] w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden rounded-[26px] border border-[#ddd7cc] bg-[#fffdfa]/98 p-5 shadow-[0_24px_70px_rgba(28,35,45,0.1)] backdrop-blur md:bottom-6 md:right-6 md:h-[min(44rem,calc(100%-3rem))]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#34527a]">{t('characterGraph.profileTitle')}</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#18202a]">{selectedNode.name}</h2>
                <p className="mt-2 text-xs text-[#697384]">{selectedNode.role || t('characterGraph.noRole')}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ddd7cc] bg-[#f8f7f3] text-[#697384] transition hover:border-[#cfc7b9] hover:text-[#18202a]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

	            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
	              <p className="text-xs leading-6 text-[#3d4856]">
	                {selectedNode.description || t('characterGraph.descriptionEmpty')}
	              </p>

	              <div className="mt-5 grid grid-cols-2 gap-3">
	                <MetricCard label={t('characterGraph.sharePercentLabel')} value={selectedNode.sharePercent > 0 ? `${selectedNode.sharePercent.toFixed(2)}%` : '--'} />
	                <MetricCard label={t('characterGraph.connectionCountLabel')} value={String(relatedEdges.length)} />
	              </div>

	              <div className="mt-5">
	                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#34527a]">{t('characterGraph.relatedRelationships')}</p>
	                {relatedEdges.length > 0 ? (
	                  <div className="mt-3 space-y-3">
                    {relatedEdges.map((edge) => {
                      const counterpart = edge.source === selectedNode.id ? edge.target : edge.source;
                      const relationTags = edge.relationTags.length > 0 ? edge.relationTags : [edge.type || t('characterGraph.relationTypeFallback')];
                      return (
                        <button
                          key={edge.id}
                          type="button"
                          onClick={() => setSelectedNodeId(counterpart)}
	                          className="w-full rounded-[18px] border border-[#e2ddd3] bg-[#f7f5f0] p-4 text-left transition hover:border-[#cfc7b9] hover:bg-[#fffdfa]"
	                        >
	                          <div>
	                            <p className="text-sm font-medium text-[#18202a]">{counterpart}</p>
	                            <div className="mt-2 flex flex-wrap gap-2">
	                              {relationTags.map((tag) => (
	                                <span key={`${edge.id}-${tag}`} className="rounded-full bg-[#eef1f4] px-2.5 py-1 text-[10px] font-semibold text-[#34527a]">
	                                  {tag}
	                                </span>
	                              ))}
	                            </div>
	                          </div>
	                          <p className="mt-3 text-xs leading-6 text-[#3d4856]">
	                            {edge.description || t('characterGraph.relationshipDescriptionEmpty')}
	                          </p>
	                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-[20px] border border-dashed border-[#d7deea] bg-[#f8fafc] px-4 py-6 text-sm text-[#7b8796]">
                    {t('characterGraph.relationshipsEmpty')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
          className="relative h-full w-full"
          style={{ cursor: isPanning ? 'grabbing' : (canPanCanvas ? 'grab' : 'default') }}
          onWheel={handleWheel}
          onPointerDown={handleCanvasPointerDown}
        >
          <defs>
            <filter id="node-shadow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="rgba(24,32,42,0.1)" />
            </filter>
            <filter id="node-focus" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="transparent" />

          <g transform={`matrix(${zoomState.scale} 0 0 ${zoomState.scale} ${zoomState.offsetX} ${zoomState.offsetY})`}>
            {layoutEdges.map((edge) => {
            const isHighlighted = !focusNodeId || edge.source === focusNodeId || edge.target === focusNodeId;
            const opacity = focusNodeId ? (isHighlighted ? 0.94 : 0.08) : 0.58;
            const strokeWidth = Math.max(1.6, Math.min(5.5, 1.2 + edge.weight / 24));

            return (
              <g key={edge.id} opacity={opacity}>
                {isHighlighted && (
                  <path
                    d={edge.path}
                    fill="none"
                    stroke="#d7d1c7"
                    strokeOpacity="0.55"
                    strokeWidth={strokeWidth + 6}
                  />
                )}
                <path
                  d={edge.path}
                  fill="none"
                  stroke={isHighlighted ? '#34527a' : '#cfc8be'}
                  strokeLinecap="round"
                  strokeWidth={strokeWidth}
                  strokeDasharray={isHighlighted ? undefined : '10 14'}
                />
              </g>
            );
          })}

            {layoutNodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isFocused = focusNodeId === node.id;
              const isActive = isSelected || isFocused;
              const isVisible = !focusNodeId || highlightedNodeIds.has(node.id);
              const labelLayout = getNodeLabelLayout(node.name, node.radius);
              const nodeMetaText = node.sharePercent > 0
                ? `${node.sharePercent.toFixed(1)}%`
                : t('characterGraph.connectionsShort', { count: node.degree });

              return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                style={{
                  cursor: 'grab',
                  opacity: isVisible ? 1 : 0.16,
                  transition: 'opacity 220ms ease',
                }}
              >
                <g
                  style={{
                    transform: isFocused ? 'translateY(-2px) scale(1.018)' : (isSelected ? 'scale(1.01)' : 'scale(1)'),
                    transformBox: 'fill-box',
                    transformOrigin: 'center center',
                    transition: 'transform 240ms cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  <circle
                    r={node.radius + 10}
                    style={{
                      fill: node.isCore ? 'rgba(52,82,122,0.10)' : 'rgba(24,32,42,0.05)',
                      opacity: isActive ? 0.92 : 0.28,
                      transition: 'opacity 220ms ease, fill 220ms ease',
                    }}
                  />
                  <circle
                    r={node.radius + (isSelected ? 2 : 0)}
                    filter="url(#node-shadow)"
                    style={{
                      fill: '#fffdfa',
                      stroke: node.isCore ? '#18202a' : (isActive ? '#34527a' : '#9aa4af'),
                      strokeWidth: isActive ? 2.2 : 1.4,
                      transition: 'stroke 220ms ease, stroke-width 220ms ease',
                    }}
                  />
                  <circle
                    r={Math.max(16, node.radius - 8 + (isFocused ? 0.8 : 0))}
                    style={{
                      fill: node.isCore ? '#34527a' : '#f2efea',
                      stroke: node.isCore ? '#34527a' : '#ddd7cc',
                      strokeWidth: 1,
                      transition: 'fill 220ms ease, stroke 220ms ease',
                    }}
                  />
                  <g pointerEvents="none">
                    {labelLayout.lines.map((line, index) => (
                      <text
                        key={`${node.id}-${index}`}
                        y={(index - (labelLayout.lines.length - 1) / 2) * labelLayout.lineHeight}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={labelLayout.fontSize}
                        fontWeight="700"
                        lengthAdjust="spacingAndGlyphs"
                        textLength={Math.min(labelLayout.maxTextWidth, estimateTextUnits(line) * labelLayout.fontSize)}
                        style={{
                          fill: node.isCore ? '#ffffff' : '#18202a',
                          transition: 'fill 220ms ease, opacity 220ms ease',
                        }}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                  <g
                    transform={`translate(0 ${node.radius + 18})`}
                    pointerEvents="none"
                    opacity={isActive ? 1 : 0}
                    style={{ transition: 'opacity 180ms ease' }}
                  >
                    <rect
                      x={-46}
                      y={-14}
                      width="92"
                      height="28"
                      rx="14"
                      fill="rgba(255,253,250,0.98)"
                      stroke="rgba(217,211,199,0.96)"
                    />
                    <text y="4" textAnchor="middle" fill="#5f6b79" fontSize="10" fontWeight="700">
                      {nodeMetaText}
                    </text>
                  </g>
                </g>
              </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function StatusPill({ text, accent = false }: { text: string; accent?: boolean }) {
  return (
    <span className={`rounded-full border px-4 py-2 text-xs backdrop-blur ${
      accent
        ? 'border-[#d6dde5] bg-[#eef1f4] text-[#34527a]'
        : 'border-[#ddd7cc] bg-[#fffdfa]/94 text-[#5f6b79]'
    }`}>
      {text}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#ddd7cc] bg-[#f7f5f0] px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#697384]">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#18202a]">{value}</p>
    </div>
  );
}

function buildSpaciousLayout(nodes: CharacterGraphNode[], edges: CharacterGraphEdge[]): LayoutNode[] {
  if (nodes.length === 0) {
    return [];
  }

  const degreeMap = new Map<string, number>();
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
  });

  const sortedNodes = [...nodes].sort((a, b) => {
    if (Number(b.isCore) !== Number(a.isCore)) {
      return Number(b.isCore) - Number(a.isCore);
    }
    const degreeDiff = (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0);
    if (degreeDiff !== 0) {
      return degreeDiff;
    }
    const scoreA = a.sharePercent > 0 ? a.sharePercent : a.weight;
    const scoreB = b.sharePercent > 0 ? b.sharePercent : b.weight;
    return scoreB - scoreA;
  });

  const layout = sortedNodes.map((node, index) => {
    const degree = degreeMap.get(node.id) ?? 0;
    const score = node.sharePercent > 0 ? node.sharePercent : node.weight;
    const radius = getNodeRadius(score, index === 0);
    const anchor = getAnchorPosition(index, sortedNodes.length);
    return {
      ...node,
      x: anchor.x,
      y: anchor.y,
      anchorX: anchor.x,
      anchorY: anchor.y,
      radius,
      degree,
      score,
    };
  });

  const indexMap = new Map(layout.map((node, index) => [node.id, index]));
  const positions = layout.map((node) => ({
    x: node.x,
    y: node.y,
    vx: 0,
    vy: 0,
  }));

  for (let iteration = 0; iteration < 220; iteration += 1) {
    for (let i = 0; i < layout.length; i += 1) {
      for (let j = i + 1; j < layout.length; j += 1) {
        const first = layout[i];
        const second = layout[j];
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const distance = Math.hypot(dx, dy) || 1;
        const minDistance = first.radius + second.radius + 108;
        const repulsion = distance < minDistance
          ? (minDistance - distance) * 0.34
          : 6200 / (distance * distance);
        const nx = dx / distance;
        const ny = dy / distance;
        positions[i].vx -= nx * repulsion;
        positions[i].vy -= ny * repulsion;
        positions[j].vx += nx * repulsion;
        positions[j].vy += ny * repulsion;
      }
    }

    edges.forEach((edge) => {
      const sourceIndex = indexMap.get(edge.source);
      const targetIndex = indexMap.get(edge.target);
      if (sourceIndex === undefined || targetIndex === undefined) return;
      const source = layout[sourceIndex];
      const target = layout[targetIndex];
      const dx = positions[targetIndex].x - positions[sourceIndex].x;
      const dy = positions[targetIndex].y - positions[sourceIndex].y;
      const distance = Math.hypot(dx, dy) || 1;
      const idealDistance = 240 + (source.radius + target.radius) * 1.55;
      const pull = (distance - idealDistance) * 0.006;
      const nx = dx / distance;
      const ny = dy / distance;
      positions[sourceIndex].vx += nx * pull;
      positions[sourceIndex].vy += ny * pull;
      positions[targetIndex].vx -= nx * pull;
      positions[targetIndex].vy -= ny * pull;
    });

    layout.forEach((node, index) => {
      const anchorStrength = index === 0 ? 0.048 : 0.016;
      positions[index].vx += (node.anchorX - positions[index].x) * anchorStrength;
      positions[index].vy += (node.anchorY - positions[index].y) * anchorStrength;

      positions[index].vx *= 0.76;
      positions[index].vy *= 0.76;
      positions[index].x = clamp(positions[index].x + positions[index].vx, CANVAS_PADDING + node.radius, STAGE_WIDTH - CANVAS_PADDING - node.radius);
      positions[index].y = clamp(positions[index].y + positions[index].vy, CANVAS_PADDING + node.radius, STAGE_HEIGHT - CANVAS_PADDING - node.radius);
    });
  }

  return layout.map((node, index) => ({
    ...node,
    x: Number(positions[index].x.toFixed(2)),
    y: Number(positions[index].y.toFixed(2)),
  }));
}

function getAnchorPosition(index: number, total: number) {
  if (index === 0) {
    return { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
  }

  const ring = index <= 5 ? 0 : index <= 13 ? 1 : 2;
  const ringStart = ring === 0 ? 1 : ring === 1 ? 6 : 14;
  const ringSize = ring === 0 ? Math.min(total - 1, 5) : ring === 1 ? Math.min(Math.max(total - 6, 0), 8) : Math.max(total - 14, 0);
  const positionInRing = index - ringStart;
  const angleOffset = ring === 0 ? -Math.PI / 2 : ring === 1 ? -Math.PI / 2 + 0.16 : -Math.PI / 2 + 0.34;
  const angle = angleOffset + (positionInRing / Math.max(ringSize, 1)) * Math.PI * 2;
  const radiusX = ring === 0 ? 300 : ring === 1 ? 500 : 660;
  const radiusY = ring === 0 ? 220 : ring === 1 ? 360 : 440;
  const jitter = ring === 0 ? 0 : ring === 1 ? 14 : 20;

  return {
    x: Number((STAGE_WIDTH / 2 + Math.cos(angle) * radiusX + Math.sin(index * 1.21) * jitter).toFixed(2)),
    y: Number((STAGE_HEIGHT / 2 + Math.sin(angle) * radiusY + Math.cos(index * 1.37) * jitter).toFixed(2)),
  };
}

function buildEdgeCurve(source: LayoutNode, target: LayoutNode, seed: number) {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curve = Math.min(120, distance * 0.18) * (seed % 2 === 0 ? 1 : -1);
  const controlX = midX + normalX * curve;
  const controlY = midY + normalY * curve;

  return {
    path: `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`,
    labelX: Number(((midX + controlX) / 2).toFixed(2)),
    labelY: Number(((midY + controlY) / 2).toFixed(2)),
  };
}

function getNodeRadius(score: number, isCenter: boolean) {
  const minRadius = isCenter ? 40 : 28;
  const maxRadius = isCenter ? 66 : 52;
  const normalized = Math.max(0, Math.min(score / 30, 1));
  return Number((minRadius + (maxRadius - minRadius) * normalized).toFixed(2));
}

function getNodeDisplayName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function getNodeLabelLayout(name: string, radius: number) {
  const displayName = getNodeDisplayName(name);
  const innerRadius = Math.max(16, radius - 8);
  const maxTextWidth = innerRadius * 1.68;
  const maxFontSize = Math.max(12, Math.min(18, innerRadius * 0.48));
  const minFontSize = Math.max(8, Math.min(11, innerRadius * 0.28));

  for (let lineCount = 1; lineCount <= 3; lineCount += 1) {
    for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
      const lineHeight = Math.max(10, fontSize * 0.94);
      const totalHeight = fontSize + (lineCount - 1) * lineHeight;
      if (totalHeight > innerRadius * 1.6) {
        continue;
      }

      const maxUnitsPerLine = maxTextWidth / fontSize;
      const lines = splitLabelIntoLines(displayName, maxUnitsPerLine, lineCount);
      if (!lines) {
        continue;
      }

      return {
        lines,
        fontSize: Number(fontSize.toFixed(1)),
        lineHeight: Number(lineHeight.toFixed(1)),
        maxTextWidth: Number(maxTextWidth.toFixed(2)),
      };
    }
  }

  const fallbackFontSize = Math.max(8, Math.min(10, innerRadius * 0.26));
  const fallbackLineHeight = Math.max(9, fallbackFontSize * 0.94);
  return {
    lines: splitLabelByUnits(displayName, Math.max(1.8, maxTextWidth / fallbackFontSize), 3),
    fontSize: Number(fallbackFontSize.toFixed(1)),
    lineHeight: Number(fallbackLineHeight.toFixed(1)),
    maxTextWidth: Number(maxTextWidth.toFixed(2)),
  };
}

function splitLabelIntoLines(name: string, maxUnitsPerLine: number, maxLines: number) {
  const lines = splitLabelByUnits(name, maxUnitsPerLine, maxLines);
  if (lines.length > maxLines) {
    return null;
  }
  if (lines.some((line) => estimateTextUnits(line) > maxUnitsPerLine + 0.05)) {
    return null;
  }
  return lines;
}

function splitLabelByUnits(name: string, maxUnitsPerLine: number, maxLines: number) {
  const lines: string[] = [];
  let currentLine = '';
  let currentUnits = 0;

  for (const char of name) {
    const charUnits = estimateCharacterUnits(char);
    if (currentLine && currentUnits + charUnits > maxUnitsPerLine && lines.length < maxLines - 1) {
      lines.push(currentLine);
      currentLine = char;
      currentUnits = charUnits;
      continue;
    }
    currentLine += char;
    currentUnits += charUnits;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function estimateTextUnits(value: string) {
  return Array.from(value).reduce((total, char) => total + estimateCharacterUnits(char), 0);
}

function estimateCharacterUnits(char: string) {
  if (/\s/.test(char)) {
    return 0.36;
  }
  if (/[A-Z]/.test(char)) {
    return 0.72;
  }
  if (/[a-z0-9]/.test(char)) {
    return 0.58;
  }
  // eslint-disable-next-line no-control-regex
  if (/[^\u0000-\u00ff]/.test(char)) {
    return 1;
  }
  return 0.66;
}

function viewportPointToGraphPoint(point: { x: number; y: number }, zoomState: ZoomState) {
  return {
    x: (point.x - zoomState.offsetX) / zoomState.scale,
    y: (point.y - zoomState.offsetY) / zoomState.scale,
  };
}

function clampZoomOffset(scale: number, offsetX: number, offsetY: number) {
  const slackX = CANVAS_PADDING * 0.6;
  const slackY = CANVAS_PADDING * 0.6;

  if (scale >= 1) {
    return {
      offsetX: Number(clamp(offsetX, STAGE_WIDTH - STAGE_WIDTH * scale - slackX, slackX).toFixed(2)),
      offsetY: Number(clamp(offsetY, STAGE_HEIGHT - STAGE_HEIGHT * scale - slackY, slackY).toFixed(2)),
    };
  }

  const centeredOffsetX = (STAGE_WIDTH - STAGE_WIDTH * scale) / 2;
  const centeredOffsetY = (STAGE_HEIGHT - STAGE_HEIGHT * scale) / 2;
  return {
    offsetX: Number(clamp(offsetX, centeredOffsetX - slackX, centeredOffsetX + slackX).toFixed(2)),
    offsetY: Number(clamp(offsetY, centeredOffsetY - slackY, centeredOffsetY + slackY).toFixed(2)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
