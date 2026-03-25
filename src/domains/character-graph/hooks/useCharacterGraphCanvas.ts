import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { CharacterGraphEdge, CharacterGraphResponse } from '@domains/analysis';
import {
  buildEdgeCurve,
  buildSpaciousLayout,
  CANVAS_PADDING,
  clamp,
  clampZoomOffset,
  DEFAULT_ZOOM_STATE,
  getFitZoomState,
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
  moved: boolean;
  startX: number;
  startY: number;
}

interface PanState {
  startX: number;
  startY: number;
  originOffsetX: number;
  originOffsetY: number;
  moved: boolean;
}

interface NodePositionState {
  graph: CharacterGraphResponse | null;
  positions: Record<string, { x: number; y: number }>;
}

interface ViewportState {
  graph: CharacterGraphResponse | null;
  isMobile: boolean;
  zoom: ZoomState | null;
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
  isPanning: boolean;
  layoutEdges: LayoutEdge[];
  layoutNodes: LayoutNode[];
  relatedEdges: CharacterGraphEdge[];
  selectedNode: LayoutNode | null;
  selectedNodeId: string | null;
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

export function useCharacterGraphCanvas({
  graph,
  isMobile,
  isLoading,
  t,
}: UseCharacterGraphCanvasParams): UseCharacterGraphCanvasResult {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const panStateRef = useRef<PanState | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [nodePositionState, setNodePositionState] = useState<NodePositionState>({ graph: null, positions: {} });
  const [viewportState, setViewportState] = useState<ViewportState>({ graph: null, isMobile: false, zoom: null });
  const [isPanning, setIsPanning] = useState(false);

  const baseNodes = useMemo(
    () => buildSpaciousLayout(graph?.nodes ?? [], graph?.edges ?? []),
    [graph?.edges, graph?.nodes],
  );

  const mobileFitZoomState = useMemo(
    () => getFitZoomState(baseNodes, {
      paddingX: 128,
      paddingTop: 122,
      paddingBottom: 236,
      targetCenterYRatio: 0.38,
      minScale: 1.08,
      maxScale: 2,
    }),
    [baseNodes],
  );
  const defaultZoomState = isMobile ? mobileFitZoomState : DEFAULT_ZOOM_STATE;
  const nodePositions = useMemo(
    () => (nodePositionState.graph === graph ? nodePositionState.positions : {}),
    [graph, nodePositionState.graph, nodePositionState.positions],
  );
  const zoomState = viewportState.graph === graph && viewportState.isMobile === isMobile && viewportState.zoom
    ? viewportState.zoom
    : defaultZoomState;

  const resolvedSelectedNodeId = selectedNodeId && graph?.nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : null;
  const resolvedHoveredNodeId = hoveredNodeId && graph?.nodes.some((node) => node.id === hoveredNodeId)
    ? hoveredNodeId
    : null;

  const layoutNodes = useMemo(
    () => baseNodes.map((node) => ({
      ...node,
      x: nodePositions[node.id]?.x ?? node.x,
      y: nodePositions[node.id]?.y ?? node.y,
    })),
    [baseNodes, nodePositions],
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

  const canPanCanvas = zoomState.scale !== DEFAULT_ZOOM_STATE.scale
    || zoomState.offsetX !== DEFAULT_ZOOM_STATE.offsetX
    || zoomState.offsetY !== DEFAULT_ZOOM_STATE.offsetY;

  const resetLayout = useCallback(() => {
    setNodePositionState({ graph, positions: {} });
    setViewportState({ graph, isMobile, zoom: null });
  }, [graph, isMobile]);

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
        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;
        if (!drag.moved && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
          drag.moved = true;
        }
        setNodePositionState((current) => {
          const currentPositions = current.graph === graph ? current.positions : {};
          return {
            graph,
            positions: {
              ...currentPositions,
              [drag.nodeId]: {
                x: clamp(point.x - drag.offsetX, CANVAS_PADDING + drag.radius, STAGE_WIDTH - CANVAS_PADDING - drag.radius),
                y: clamp(point.y - drag.offsetY, CANVAS_PADDING + drag.radius, STAGE_HEIGHT - CANVAS_PADDING - drag.radius),
              },
            },
          };
        });
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
      setViewportState((current) => {
        const currentZoom = current.graph === graph && current.isMobile === isMobile && current.zoom
          ? current.zoom
          : defaultZoomState;
        const nextOffset = clampZoomOffset(
          currentZoom.scale,
          pan.originOffsetX + deltaX,
          pan.originOffsetY + deltaY,
        );
        if (nextOffset.offsetX === currentZoom.offsetX && nextOffset.offsetY === currentZoom.offsetY) {
          return current;
        }
        return {
          graph,
          isMobile,
          zoom: {
            ...currentZoom,
            ...nextOffset,
          },
        };
      });
    };

    const handlePointerUp = () => {
      const drag = dragStateRef.current;
      if (drag && !drag.moved) {
        setSelectedNodeId(drag.nodeId);
      }
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
  }, [defaultZoomState, getSvgPoint, getViewportPoint, graph, isMobile]);

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => {
    const point = getSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    dragStateRef.current = {
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      radius: node.radius,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    };
    setHoveredNodeId(node.id);
    event.stopPropagation();
    event.preventDefault();
  }, [getSvgPoint]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const viewportPoint = getViewportPoint(event.clientX, event.clientY);
    if (!viewportPoint) return;

    event.preventDefault();
    setViewportState((current) => {
      const currentZoom = current.graph === graph && current.isMobile === isMobile && current.zoom
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
      const nextOffset = clampZoomOffset(
        nextScale,
        viewportPoint.x - graphPoint.x * nextScale,
        viewportPoint.y - graphPoint.y * nextScale,
      );
      return {
        graph,
        isMobile,
        zoom: {
          scale: nextScale,
          ...nextOffset,
        },
      };
    });
  }, [defaultZoomState, getViewportPoint, graph, isMobile]);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [handleWheel, isLoading]);

  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
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
    isPanning,
    layoutEdges,
    layoutNodes,
    relatedEdges,
    selectedNode,
    selectedNodeId: resolvedSelectedNodeId,
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
