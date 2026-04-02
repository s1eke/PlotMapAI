import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { CharacterGraphEdge, CharacterGraphResponse } from '@domains/analysis';
import type { AppError } from '@shared/errors';
import { AppErrorCode, toAppError } from '@shared/errors';
import type { GraphLayoutProgress } from '../workers/layoutClient';
import { runGraphLayoutTask } from '../workers/layoutClient';
import {
  buildEdgeCurve,
  CANVAS_PADDING,
  clamp,
  DEFAULT_ZOOM_STATE,
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  viewportPointToGraphPoint,
  type LayoutEdge,
  type LayoutNode,
  type ZoomState,
} from '../utils/characterGraphLayout';

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  radius: number;
  startX: number;
  startY: number;
}

interface PanState {
  startX: number;
  startY: number;
  originOffsetX: number;
  originOffsetY: number;
}

interface PointerSnapshot {
  clientX: number;
  clientY: number;
  viewportX: number;
  viewportY: number;
}

type GestureState =
  | { kind: 'idle' }
  | { kind: 'nodePending'; pointerId: number; drag: DragState }
  | { kind: 'nodeDrag'; pointerId: number; drag: DragState }
  | { kind: 'panPending'; pointerId: number; pan: PanState }
  | { kind: 'pan'; pointerId: number; pan: PanState }
  | {
    kind: 'pinch';
    pointerIds: [number, number];
    initialDistance: number;
    initialScale: number;
    initialGraphPoint: { x: number; y: number };
  };

interface NodePositionState {
  graph: CharacterGraphResponse | null;
  stageHeight: number;
  positions: Record<string, { x: number; y: number }>;
}

interface ViewportState {
  graph: CharacterGraphResponse | null;
  isMobile: boolean;
  stageHeight: number;
  zoom: ZoomState | null;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface StageSize {
  width: number;
  height: number;
}

interface UseCharacterGraphCanvasParams {
  graph: CharacterGraphResponse | null;
  isMobile: boolean;
  isLoading: boolean;
  t: TFunction;
}

interface UseCharacterGraphCanvasResult {
  svgRef: RefObject<SVGSVGElement | null>;
  canPanCanvas: boolean;
  focusNodeId: string | null;
  highlightedNodeIds: Set<string>;
  isGestureInteracting: boolean;
  isLayoutComputing: boolean;
  layoutError: AppError | null;
  isPanning: boolean;
  layoutEdges: LayoutEdge[];
  layoutMessage: string | null;
  layoutNodes: LayoutNode[];
  layoutProgress: number;
  relatedEdges: CharacterGraphEdge[];
  selectedNode: LayoutNode | null;
  selectedNodeId: string | null;
  stageHeight: number;
  stageMeta: string[];
  zoomState: ZoomState;
  clearSelection: () => void;
  handleCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  handleNodeMouseEnter: (nodeId: string) => void;
  handleNodeMouseLeave: (nodeId: string) => void;
  handleNodePointerDown: (event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => void;
  resetLayout: () => void;
  selectNode: (nodeId: string) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getLayoutMessage(progress: number, t: TFunction): string {
  return t('characterGraph.layoutComputing', { percent: progress });
}

const DESKTOP_POINTER_MOVE_THRESHOLD = 3;
const MOBILE_POINTER_MOVE_THRESHOLD = 10;
const MIN_PINCH_DISTANCE = 12;
const DEFAULT_VIEWPORT_SIZE: ViewportSize = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
};
const MAX_MOBILE_STAGE_HEIGHT = 2400;

function getPointerMoveThreshold(isMobile: boolean): number {
  return isMobile ? MOBILE_POINTER_MOVE_THRESHOLD : DESKTOP_POINTER_MOVE_THRESHOLD;
}

function getResponsiveMobileFitZoomState(
  nodes: Array<Pick<LayoutNode, 'x' | 'y' | 'radius'>>,
  viewportSize: ViewportSize,
  stageSize: StageSize,
): ZoomState {
  const horizontalPaddingPx = Math.min(28, Math.max(18, viewportSize.width * 0.05));
  const topPaddingPx = Math.min(44, Math.max(20, viewportSize.height * 0.045));
  const bottomPaddingPx = Math.min(120, Math.max(72, viewportSize.height * 0.14));

  if (nodes.length === 0) {
    return DEFAULT_ZOOM_STATE;
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.radius));
  const maxX = Math.max(...nodes.map((node) => node.x + node.radius));
  const minY = Math.min(...nodes.map((node) => node.y - node.radius));
  const maxY = Math.max(...nodes.map((node) => node.y + node.radius));
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const paddingX = (horizontalPaddingPx / Math.max(1, viewportSize.width)) * stageSize.width;
  const paddingTop = (topPaddingPx / Math.max(1, viewportSize.height)) * stageSize.height;
  const paddingBottom = (bottomPaddingPx / Math.max(1, viewportSize.height)) * stageSize.height;
  const availableWidth = Math.max(1, stageSize.width - paddingX * 2);
  const availableHeight = Math.max(1, stageSize.height - paddingTop - paddingBottom);
  const scale = clamp(
    Number(Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight).toFixed(4)),
    1.02,
    2.12,
  );
  const targetCenterY = paddingTop + availableHeight * 0.48;

  return clampZoomOffsetForStage(
    stageSize,
    scale,
    stageSize.width / 2 - centerX * scale,
    targetCenterY - centerY * scale,
  );
}

function getResponsiveStageHeight(viewportSize: ViewportSize, isMobile: boolean): number {
  if (!isMobile) {
    return STAGE_HEIGHT;
  }

  const rawHeight = STAGE_WIDTH * (viewportSize.height / Math.max(1, viewportSize.width));
  return Number(clamp(rawHeight, STAGE_HEIGHT, MAX_MOBILE_STAGE_HEIGHT).toFixed(2));
}

function clampZoomOffsetForStage(
  stageSize: StageSize,
  scale: number,
  offsetX: number,
  offsetY: number,
): ZoomState {
  const slackX = CANVAS_PADDING * 0.6;
  const slackY = CANVAS_PADDING * 0.6;

  if (scale >= 1) {
    return {
      scale,
      offsetX: Number(
        clamp(offsetX, stageSize.width - stageSize.width * scale - slackX, slackX).toFixed(2),
      ),
      offsetY: Number(
        clamp(offsetY, stageSize.height - stageSize.height * scale - slackY, slackY).toFixed(2),
      ),
    };
  }

  const centeredOffsetX = (stageSize.width - stageSize.width * scale) / 2;
  const centeredOffsetY = (stageSize.height - stageSize.height * scale) / 2;
  return {
    scale,
    offsetX: Number(clamp(offsetX, centeredOffsetX - slackX, centeredOffsetX + slackX).toFixed(2)),
    offsetY: Number(clamp(offsetY, centeredOffsetY - slackY, centeredOffsetY + slackY).toFixed(2)),
  };
}

function clampNodeToVisibleViewport(
  point: { x: number; y: number },
  radius: number,
  zoomState: ZoomState,
  stageSize: StageSize,
): { x: number; y: number } {
  const visibleTopLeft = viewportPointToGraphPoint({ x: 0, y: 0 }, zoomState);
  const visibleBottomRight = viewportPointToGraphPoint(
    { x: stageSize.width, y: stageSize.height },
    zoomState,
  );
  const minX = Math.max(
    CANVAS_PADDING * 0.35 + radius,
    Math.min(visibleTopLeft.x, visibleBottomRight.x) + radius,
  );
  const maxX = Math.min(
    STAGE_WIDTH - CANVAS_PADDING * 0.35 - radius,
    Math.max(visibleTopLeft.x, visibleBottomRight.x) - radius,
  );
  const minY = Math.max(
    CANVAS_PADDING * 0.35 + radius,
    Math.min(visibleTopLeft.y, visibleBottomRight.y) + radius,
  );
  const maxY = Math.min(
    stageSize.height - CANVAS_PADDING * 0.35 - radius,
    Math.max(visibleTopLeft.y, visibleBottomRight.y) - radius,
  );

  return {
    x: clamp(point.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(point.y, Math.min(minY, maxY), Math.max(minY, maxY)),
  };
}

export function useCharacterGraphCanvas({
  graph,
  isMobile,
  isLoading,
  t,
}: UseCharacterGraphCanvasParams): UseCharacterGraphCanvasResult {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const activePointersRef = useRef<Map<number, PointerSnapshot>>(new Map());
  const gestureStateRef = useRef<GestureState>({ kind: 'idle' });
  const interactionFrameRef = useRef<number | null>(null);
  const queuedViewportZoomRef = useRef<ZoomState | null>(null);
  const queuedNodePositionRef = useRef<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);
  const zoomStateRef = useRef<ZoomState>(DEFAULT_ZOOM_STATE);
  const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [nodePositionState, setNodePositionState] = useState<NodePositionState>({
    graph: null,
    stageHeight: STAGE_HEIGHT,
    positions: {},
  });
  const [viewportState, setViewportState] = useState<ViewportState>({
    graph: null,
    isMobile: false,
    stageHeight: STAGE_HEIGHT,
    zoom: null,
  });
  const [isGestureInteracting, setIsGestureInteracting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(DEFAULT_VIEWPORT_SIZE);
  const [layoutState, setLayoutState] = useState<{
    error: AppError | null;
    graph: CharacterGraphResponse | null;
    isComputing: boolean;
    nodes: LayoutNode[];
    progress: number;
  }>({
    error: null,
    graph: null,
    isComputing: false,
    nodes: [],
    progress: 0,
  });

  useEffect(() => {
    if (!graph) {
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      setLayoutState((current) => ({
        error: null,
        graph,
        isComputing: true,
        nodes: current.graph === graph ? current.nodes : [],
        progress: 0,
      }));

      try {
        const nodes = await runGraphLayoutTask(
          {
            nodes: graph.nodes,
            edges: graph.edges,
          },
          {
            signal: controller.signal,
            onProgress: (progress: GraphLayoutProgress) => {
              setLayoutState((current) => {
                if (current.graph !== graph) {
                  return current;
                }
                return {
                  ...current,
                  isComputing: true,
                  progress: progress.progress,
                };
              });
            },
          },
        );
        setLayoutState({
          error: null,
          graph,
          isComputing: false,
          nodes,
          progress: 100,
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        const normalized = toAppError(error, {
          code: AppErrorCode.WORKER_EXECUTION_FAILED,
          kind: 'execution',
          source: 'character-graph',
          userMessageKey: 'errors.WORKER_EXECUTION_FAILED',
        });
        setLayoutState({
          error: normalized,
          graph,
          isComputing: false,
          nodes: [],
          progress: 0,
        });
      }
    };

    run();

    return () => {
      controller.abort();
    };
  }, [graph, layoutRevision]);

  const baseNodes = useMemo(
    () => (layoutState.graph === graph ? layoutState.nodes : []),
    [graph, layoutState.graph, layoutState.nodes],
  );
  const isLayoutComputing = layoutState.graph === graph && layoutState.isComputing;
  const layoutError = layoutState.graph === graph ? layoutState.error : null;
  const layoutProgress = layoutState.graph === graph ? layoutState.progress : 0;
  const stageHeight = useMemo(
    () => getResponsiveStageHeight(viewportSize, isMobile),
    [isMobile, viewportSize],
  );
  const stageSize = useMemo<StageSize>(
    () => ({ width: STAGE_WIDTH, height: stageHeight }),
    [stageHeight],
  );
  const stageScaleY = stageHeight / STAGE_HEIGHT;
  const scaledBaseNodes = useMemo(
    () => baseNodes.map((node) => ({
      ...node,
      y: Number((node.y * stageScaleY).toFixed(2)),
      anchorY: Number((node.anchorY * stageScaleY).toFixed(2)),
    })),
    [baseNodes, stageScaleY],
  );

  const mobileFitZoomState = useMemo(
    () => getResponsiveMobileFitZoomState(scaledBaseNodes, viewportSize, stageSize),
    [scaledBaseNodes, stageSize, viewportSize],
  );
  const defaultZoomState = isMobile ? mobileFitZoomState : DEFAULT_ZOOM_STATE;
  const nodePositions = useMemo(
    () =>
      (nodePositionState.graph === graph && nodePositionState.stageHeight === stageHeight
        ? nodePositionState.positions
        : {}),
    [
      graph,
      nodePositionState.graph,
      nodePositionState.positions,
      nodePositionState.stageHeight,
      stageHeight,
    ],
  );
  const zoomState = viewportState.graph === graph
    && viewportState.isMobile === isMobile
    && viewportState.stageHeight === stageHeight
    && viewportState.zoom
    ? viewportState.zoom
    : defaultZoomState;

  useEffect(() => {
    zoomStateRef.current = zoomState;
  }, [zoomState]);

  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) {
      return;
    }

    const updateViewportSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      setViewportSize((current) => {
        if (current.width === rect.width && current.height === rect.height) {
          return current;
        }

        return {
          width: rect.width,
          height: rect.height,
        };
      });
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [graph, isMobile]);

  const resolvedSelectedNodeId =
    selectedNodeId && graph?.nodes.some((node) => node.id === selectedNodeId)
      ? selectedNodeId
      : null;
  const resolvedHoveredNodeId =
    hoveredNodeId && graph?.nodes.some((node) => node.id === hoveredNodeId)
      ? hoveredNodeId
      : null;

  const layoutNodes = useMemo(
    () => scaledBaseNodes.map((node) => ({
      ...node,
      x: nodePositions[node.id]?.x ?? node.x,
      y: nodePositions[node.id]?.y ?? node.y,
    })),
    [nodePositions, scaledBaseNodes],
  );

  const positionMap = useMemo(
    () => new Map(layoutNodes.map((node) => [node.id, node])),
    [layoutNodes],
  );

  const selectedNode = useMemo(
    () => layoutNodes.find((node) => node.id === resolvedSelectedNodeId) ?? null,
    [layoutNodes, resolvedSelectedNodeId],
  );

  const focusNodeId = resolvedHoveredNodeId ?? resolvedSelectedNodeId ?? null;

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

  const canPanCanvas = isMobile
    || zoomState.scale !== DEFAULT_ZOOM_STATE.scale
    || zoomState.offsetX !== DEFAULT_ZOOM_STATE.offsetX
    || zoomState.offsetY !== DEFAULT_ZOOM_STATE.offsetY;

  const resetLayout = useCallback(() => {
    activePointersRef.current.clear();
    gestureStateRef.current = { kind: 'idle' };
    queuedViewportZoomRef.current = null;
    queuedNodePositionRef.current = null;
    setIsGestureInteracting(false);
    setIsPanning(false);
    setNodePositionState({ graph, stageHeight, positions: {} });
    setViewportState({ graph, isMobile, stageHeight, zoom: null });
    setLayoutRevision((current) => current + 1);
  }, [graph, isMobile, stageHeight]);

  const getViewportPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * STAGE_WIDTH,
      y: ((clientY - rect.top) / rect.height) * stageHeight,
    };
  }, [stageHeight]);

  const flushInteractionUpdates = useCallback(() => {
    interactionFrameRef.current = null;

    if (queuedNodePositionRef.current && graph) {
      const nextNodePosition = queuedNodePositionRef.current;
      queuedNodePositionRef.current = null;
      setNodePositionState((current) => {
        const currentPositions = current.graph === graph && current.stageHeight === stageHeight
          ? current.positions
          : nodePositionsRef.current;
        return {
          graph,
          stageHeight,
          positions: {
            ...currentPositions,
            [nextNodePosition.nodeId]: nextNodePosition.position,
          },
        };
      });
    }

    if (queuedViewportZoomRef.current && graph) {
      const nextZoom = queuedViewportZoomRef.current;
      queuedViewportZoomRef.current = null;
      setViewportState({
        graph,
        isMobile,
        stageHeight,
        zoom: nextZoom,
      });
    }
  }, [graph, isMobile, stageHeight]);

  const scheduleInteractionFlush = useCallback(() => {
    if (interactionFrameRef.current !== null) {
      return;
    }

    interactionFrameRef.current = window.requestAnimationFrame(flushInteractionUpdates);
  }, [flushInteractionUpdates]);

  const queueViewportZoom = useCallback((nextZoom: ZoomState) => {
    queuedViewportZoomRef.current = nextZoom;
    scheduleInteractionFlush();
  }, [scheduleInteractionFlush]);

  const queueNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    queuedNodePositionRef.current = { nodeId, position };
    scheduleInteractionFlush();
  }, [scheduleInteractionFlush]);

  const clearActiveGesture = useCallback(() => {
    gestureStateRef.current = { kind: 'idle' };
    activePointersRef.current.clear();
    queuedViewportZoomRef.current = null;
    queuedNodePositionRef.current = null;
    setIsGestureInteracting(false);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    return () => {
      clearActiveGesture();
      if (interactionFrameRef.current !== null) {
        cancelAnimationFrame(interactionFrameRef.current);
      }
    };
  }, [clearActiveGesture]);

  const maybeStartPinchGesture = useCallback(() => {
    if (!isMobile || activePointersRef.current.size < 2) {
      return false;
    }

    const [firstPointer, secondPointer] = Array.from(
      activePointersRef.current.entries(),
    ).slice(0, 2);
    if (!firstPointer || !secondPointer) {
      return false;
    }

    const [firstId, first] = firstPointer;
    const [secondId, second] = secondPointer;
    const initialDistance = Math.hypot(
      second.viewportX - first.viewportX,
      second.viewportY - first.viewportY,
    );
    if (initialDistance < MIN_PINCH_DISTANCE) {
      return false;
    }

    const initialCenter = {
      x: (first.viewportX + second.viewportX) / 2,
      y: (first.viewportY + second.viewportY) / 2,
    };
    const initialGraphPoint = viewportPointToGraphPoint(initialCenter, zoomStateRef.current);
    gestureStateRef.current = {
      kind: 'pinch',
      pointerIds: [firstId, secondId],
      initialDistance,
      initialScale: zoomStateRef.current.scale,
      initialGraphPoint,
    };
    setIsGestureInteracting(true);
    setIsPanning(true);
    return true;
  }, [isMobile]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const viewportPoint = getViewportPoint(event.clientX, event.clientY);
      const existingPointer = activePointersRef.current.get(event.pointerId);
      if (!viewportPoint || !existingPointer) return;

      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
        viewportX: viewportPoint.x,
        viewportY: viewportPoint.y,
      });

      const gesture = gestureStateRef.current;
      if (gesture.kind === 'pinch') {
        const [firstId, secondId] = gesture.pointerIds;
        const first = activePointersRef.current.get(firstId);
        const second = activePointersRef.current.get(secondId);
        if (!first || !second) {
          return;
        }

        const currentDistance = Math.hypot(
          second.viewportX - first.viewportX,
          second.viewportY - first.viewportY,
        );
        if (currentDistance < MIN_PINCH_DISTANCE) {
          return;
        }

        const currentCenter = {
          x: (first.viewportX + second.viewportX) / 2,
          y: (first.viewportY + second.viewportY) / 2,
        };
        const nextScale = clamp(
          Number(((gesture.initialScale * currentDistance) / gesture.initialDistance).toFixed(4)),
          MIN_ZOOM_SCALE,
          MAX_ZOOM_SCALE,
        );
        const nextZoom = clampZoomOffsetForStage(
          stageSize,
          nextScale,
          currentCenter.x - gesture.initialGraphPoint.x * nextScale,
          currentCenter.y - gesture.initialGraphPoint.y * nextScale,
        );
        queueViewportZoom(nextZoom);
        return;
      }

      const threshold = getPointerMoveThreshold(isMobile);
      if (gesture.kind === 'nodePending' || gesture.kind === 'nodeDrag') {
        const point = viewportPointToGraphPoint(viewportPoint, zoomStateRef.current);
        const deltaX = event.clientX - gesture.drag.startX;
        const deltaY = event.clientY - gesture.drag.startY;
        if (gesture.kind === 'nodePending' && (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold)) {
          gestureStateRef.current = {
            kind: 'nodeDrag',
            pointerId: gesture.pointerId,
            drag: gesture.drag,
          };
          setIsGestureInteracting(true);
        }

        if (gestureStateRef.current.kind !== 'nodeDrag') {
          return;
        }

        queueNodePosition(
          gesture.drag.nodeId,
          clampNodeToVisibleViewport(
            {
              x: point.x - gesture.drag.offsetX,
              y: point.y - gesture.drag.offsetY,
            },
            gesture.drag.radius,
            zoomStateRef.current,
            stageSize,
          ),
        );
        event.preventDefault();
        return;
      }

      if (gesture.kind !== 'panPending' && gesture.kind !== 'pan') {
        return;
      }

      const deltaX = viewportPoint.x - gesture.pan.startX;
      const deltaY = viewportPoint.y - gesture.pan.startY;
      if (gesture.kind === 'panPending' && (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold)) {
        gestureStateRef.current = {
          kind: 'pan',
          pointerId: gesture.pointerId,
          pan: gesture.pan,
        };
        setIsGestureInteracting(true);
        setIsPanning(true);
      }

      if (gestureStateRef.current.kind !== 'pan') {
        return;
      }

      const nextZoom = clampZoomOffsetForStage(
        stageSize,
        zoomStateRef.current.scale,
        gesture.pan.originOffsetX + deltaX,
        gesture.pan.originOffsetY + deltaY,
      );
      queueViewportZoom(nextZoom);
      event.preventDefault();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const gesture = gestureStateRef.current;
      activePointersRef.current.delete(event.pointerId);

      if (gesture.kind === 'pinch') {
        gestureStateRef.current = { kind: 'idle' };
        setIsGestureInteracting(false);
        setIsPanning(false);
        return;
      }

      if (
        (gesture.kind === 'nodePending' || gesture.kind === 'nodeDrag' || gesture.kind === 'panPending' || gesture.kind === 'pan')
        && event.pointerId !== gesture.pointerId
      ) {
        return;
      }

      if (gesture.kind === 'nodePending') {
        setSelectedNodeId(gesture.drag.nodeId);
      } else if (gesture.kind === 'panPending') {
        setSelectedNodeId(null);
      }

      gestureStateRef.current = { kind: 'idle' };
      queuedViewportZoomRef.current = null;
      queuedNodePositionRef.current = null;
      setIsGestureInteracting(false);
      setIsPanning(false);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);
      gestureStateRef.current = { kind: 'idle' };
      queuedViewportZoomRef.current = null;
      queuedNodePositionRef.current = null;
      setIsGestureInteracting(false);
      setIsPanning(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [getViewportPoint, graph, isMobile, queueNodePosition, queueViewportZoom, stageSize]);

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => {
      const viewportPoint = getViewportPoint(event.clientX, event.clientY);
      const point = viewportPointToGraphPoint({
        x: viewportPoint?.x ?? 0,
        y: viewportPoint?.y ?? 0,
      }, zoomStateRef.current);
      if (!viewportPoint) return;

      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
        viewportX: viewportPoint.x,
        viewportY: viewportPoint.y,
      });
      if (maybeStartPinchGesture()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      gestureStateRef.current = {
        kind: 'nodePending',
        pointerId: event.pointerId,
        drag: {
          nodeId: node.id,
          offsetX: point.x - node.x,
          offsetY: point.y - node.y,
          radius: node.radius,
          startX: event.clientX,
          startY: event.clientY,
        },
      };
      setHoveredNodeId(node.id);
      event.stopPropagation();
      event.preventDefault();
    }, [getViewportPoint, maybeStartPinchGesture],
  );

  const handleWheel = useCallback((event: WheelEvent) => {
    const viewportPoint = getViewportPoint(event.clientX, event.clientY);
    if (!viewportPoint) return;

    event.preventDefault();
    setViewportState((current) => {
      const currentZoom = current.graph === graph && current.isMobile === isMobile && current.zoom
        && current.stageHeight === stageHeight
        ? current.zoom
        : defaultZoomState;
      const nextScale = clamp(
        Number((currentZoom.scale * Math.exp(-event.deltaY * 0.0015)).toFixed(4)),
        MIN_ZOOM_SCALE,
        MAX_ZOOM_SCALE,
      );
      if (nextScale === currentZoom.scale) {
        return current;
      }

      const graphPoint = viewportPointToGraphPoint(viewportPoint, currentZoom);
      const nextZoom = clampZoomOffsetForStage(
        stageSize,
        nextScale,
        viewportPoint.x - graphPoint.x * nextScale,
        viewportPoint.y - graphPoint.y * nextScale,
      );
      return {
        graph,
        isMobile,
        stageHeight,
        zoom: nextZoom,
      };
    });
  }, [defaultZoomState, getViewportPoint, graph, isMobile, stageHeight, stageSize]);

  useLayoutEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [handleWheel, isLoading]);

  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const viewportPoint = getViewportPoint(event.clientX, event.clientY);
    if (!viewportPoint) {
      setSelectedNodeId(null);
      return;
    }

    activePointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      viewportX: viewportPoint.x,
      viewportY: viewportPoint.y,
    });
    if (maybeStartPinchGesture()) {
      event.preventDefault();
      return;
    }

    if (!canPanCanvas) {
      setSelectedNodeId(null);
      return;
    }

    gestureStateRef.current = {
      kind: 'panPending',
      pointerId: event.pointerId,
      pan: {
        startX: viewportPoint.x,
        startY: viewportPoint.y,
        originOffsetX: zoomStateRef.current.offsetX,
        originOffsetY: zoomStateRef.current.offsetY,
      },
    };
    event.preventDefault();
  }, [canPanCanvas, getViewportPoint, maybeStartPinchGesture]);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleNodeMouseEnter = useCallback((nodeId: string) => {
    setHoveredNodeId(nodeId);
  }, []);

  const handleNodeMouseLeave = useCallback((nodeId: string) => {
    setHoveredNodeId((current) => (current === nodeId ? null : current));
  }, []);

  return {
    svgRef,
    canPanCanvas,
    focusNodeId,
    highlightedNodeIds,
    isGestureInteracting,
    isLayoutComputing,
    layoutError,
    isPanning,
    layoutEdges,
    layoutMessage: isLayoutComputing ? getLayoutMessage(layoutProgress, t) : null,
    layoutNodes,
    layoutProgress,
    relatedEdges,
    selectedNode,
    selectedNodeId: resolvedSelectedNodeId,
    stageHeight,
    stageMeta,
    zoomState,
    clearSelection,
    handleCanvasPointerDown,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleNodePointerDown,
    resetLayout,
    selectNode,
  };
}
