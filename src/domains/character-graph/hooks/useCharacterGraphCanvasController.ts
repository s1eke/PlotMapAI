import { useCallback, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { TFunction } from 'i18next';

import type { CharacterGraphEdge, CharacterGraphResponse } from '@shared/contracts';
import type { AppError } from '@shared/errors';

import { useCharacterGraphCanvasBindings } from './useCharacterGraphCanvasBindings';
import { useCharacterGraphCanvasLayoutState } from './useCharacterGraphCanvasLayoutState';
import type { LayoutEdge, LayoutNode, ZoomState } from '../utils/characterGraphLayout';
import { DEFAULT_ZOOM_STATE } from '../utils/characterGraphLayout';
import type { CharacterGraphViewportSize } from '../utils/characterGraphViewportTransform';
import {
  canPanCharacterGraphCanvas,
  DEFAULT_CHARACTER_GRAPH_VIEWPORT_SIZE,
  getResponsiveMobileFitZoomState,
} from '../utils/characterGraphViewportTransform';

interface ViewportState {
  graph: CharacterGraphResponse | null;
  isMobile: boolean;
  stageHeight: number;
  zoom: ZoomState | null;
}

interface UseCharacterGraphCanvasControllerParams {
  graph: CharacterGraphResponse | null;
  isMobile: boolean;
  t: TFunction;
}

export interface CharacterGraphCanvasLayoutGroup {
  edges: LayoutEdge[];
  error: AppError | null;
  focusNodeId: string | null;
  highlightedNodeIds: ReadonlySet<string>;
  isComputing: boolean;
  message: string | null;
  nodes: LayoutNode[];
  progress: number;
  relatedEdges: CharacterGraphEdge[];
  selectedNode: LayoutNode | null;
  selectedNodeId: string | null;
  stageHeight: number;
  stageMeta: string[];
}

export interface CharacterGraphCanvasViewportGroup {
  canPanCanvas: boolean;
  zoomState: ZoomState;
}

export interface CharacterGraphCanvasGestureGroup {
  isInteracting: boolean;
  isPanning: boolean;
}

export interface CharacterGraphCanvasBindingsGroup {
  onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onNodeMouseEnter: (nodeId: string) => void;
  onNodeMouseLeave: (nodeId: string) => void;
  onNodePointerDown: (event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => void;
  svgRef: RefObject<SVGSVGElement | null>;
}

export interface CharacterGraphCanvasActionsGroup {
  clearSelection: () => void;
  resetLayout: () => void;
  selectNode: (nodeId: string) => void;
}

export interface CharacterGraphCanvasController {
  actions: CharacterGraphCanvasActionsGroup;
  bindings: CharacterGraphCanvasBindingsGroup;
  gesture: CharacterGraphCanvasGestureGroup;
  layout: CharacterGraphCanvasLayoutGroup;
  viewport: CharacterGraphCanvasViewportGroup;
}

export function useCharacterGraphCanvasController({
  graph,
  isMobile,
  t,
}: UseCharacterGraphCanvasControllerParams): CharacterGraphCanvasController {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState<CharacterGraphViewportSize>(
    DEFAULT_CHARACTER_GRAPH_VIEWPORT_SIZE,
  );
  const [viewportState, setViewportState] = useState<ViewportState>({
    graph: null,
    isMobile: false,
    stageHeight: 0,
    zoom: null,
  });

  const layoutState = useCharacterGraphCanvasLayoutState({
    graph,
    isMobile,
    t,
    viewportSize,
  });
  const defaultZoomState = useMemo(
    () => (isMobile
      ? getResponsiveMobileFitZoomState(
        layoutState.baseNodes,
        viewportSize,
        layoutState.stageSize,
      )
      : DEFAULT_ZOOM_STATE),
    [isMobile, layoutState.baseNodes, layoutState.stageSize, viewportSize],
  );
  const { resetLayoutState, stageHeight } = layoutState;
  const zoomState = viewportState.graph === graph
    && viewportState.isMobile === isMobile
    && viewportState.stageHeight === stageHeight
    && viewportState.zoom
    ? viewportState.zoom
    : defaultZoomState;
  const canPanCanvas = canPanCharacterGraphCanvas(isMobile, zoomState);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const setViewportZoom = useCallback((nextZoom: ZoomState) => {
    setViewportState({
      graph,
      isMobile,
      stageHeight,
      zoom: nextZoom,
    });
  }, [graph, isMobile, stageHeight]);

  const bindingsState = useCharacterGraphCanvasBindings({
    canPanCanvas,
    clearSelection,
    graph,
    isMobile,
    onViewportSizeChange: setViewportSize,
    setHoveredNodeId,
    setNodePosition: layoutState.setNodePosition,
    setViewportZoom,
    stageHeight,
    stageSize: layoutState.stageSize,
    selectNode,
    zoomState,
  });
  const { resetInteraction } = bindingsState;

  const resetLayout = useCallback(() => {
    resetInteraction();
    setViewportState({
      graph,
      isMobile,
      stageHeight,
      zoom: null,
    });
    resetLayoutState();
  }, [graph, isMobile, resetInteraction, resetLayoutState, stageHeight]);

  const resolvedSelectedNodeId = selectedNodeId
    && graph?.nodes.some((node) => node.id === selectedNodeId)
    ? selectedNodeId
    : null;
  const resolvedHoveredNodeId = hoveredNodeId
    && graph?.nodes.some((node) => node.id === hoveredNodeId)
    ? hoveredNodeId
    : null;
  const selectedNode = useMemo(
    () => layoutState.nodes.find((node) => node.id === resolvedSelectedNodeId) ?? null,
    [layoutState.nodes, resolvedSelectedNodeId],
  );
  const focusNodeId = resolvedHoveredNodeId ?? resolvedSelectedNodeId ?? null;
  const highlightedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!focusNodeId || !graph) {
      return ids;
    }

    ids.add(focusNodeId);
    graph.edges.forEach((edge) => {
      if (edge.source === focusNodeId || edge.target === focusNodeId) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    });
    return ids;
  }, [focusNodeId, graph]);
  const relatedEdges = useMemo(() => {
    if (!selectedNode || !graph) {
      return [];
    }

    return graph.edges
      .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
      .sort((a, b) => b.weight - a.weight || b.mentionCount - a.mentionCount);
  }, [graph, selectedNode]);

  return {
    actions: {
      clearSelection,
      resetLayout,
      selectNode,
    },
    bindings: bindingsState.bindings,
    gesture: bindingsState.gesture,
    layout: {
      edges: layoutState.edges,
      error: layoutState.error,
      focusNodeId,
      highlightedNodeIds,
      isComputing: layoutState.isComputing,
      message: layoutState.message,
      nodes: layoutState.nodes,
      progress: layoutState.progress,
      relatedEdges,
      selectedNode,
      selectedNodeId: resolvedSelectedNodeId,
      stageHeight,
      stageMeta: layoutState.stageMeta,
    },
    viewport: {
      canPanCanvas,
      zoomState,
    },
  };
}
