import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';

import type { CharacterGraphResponse } from '@shared/contracts';
import type { AppError } from '@shared/errors';
import { AppErrorCode, toAppError } from '@shared/errors';

import type { CharacterGraphViewportSize, CharacterGraphStageSize } from '../utils/characterGraphViewportTransform';
import {
  getCharacterGraphStageSize,
  getResponsiveCharacterGraphStageHeight,
} from '../utils/characterGraphViewportTransform';
import {
  buildEdgeCurve,
  STAGE_HEIGHT,
  type LayoutEdge,
  type LayoutNode,
} from '../utils/characterGraphLayout';
import type { GraphLayoutProgress } from '../workers/layoutClient';
import { runGraphLayoutTask } from '../workers/layoutClient';

interface LayoutComputationState {
  error: AppError | null;
  graph: CharacterGraphResponse | null;
  isComputing: boolean;
  nodes: LayoutNode[];
  progress: number;
}

interface NodePositionState {
  graph: CharacterGraphResponse | null;
  positions: Record<string, { x: number; y: number }>;
  stageHeight: number;
}

interface UseCharacterGraphCanvasLayoutStateParams {
  graph: CharacterGraphResponse | null;
  isMobile: boolean;
  t: TFunction;
  viewportSize: CharacterGraphViewportSize;
}

interface UseCharacterGraphCanvasLayoutStateResult {
  baseNodes: LayoutNode[];
  edges: LayoutEdge[];
  error: AppError | null;
  isComputing: boolean;
  message: string | null;
  nodes: LayoutNode[];
  progress: number;
  resetLayoutState: () => void;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  stageHeight: number;
  stageMeta: string[];
  stageSize: CharacterGraphStageSize;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getLayoutMessage(progress: number, t: TFunction): string {
  return t('characterGraph.layoutComputing', { percent: progress });
}

export function useCharacterGraphCanvasLayoutState({
  graph,
  isMobile,
  t,
  viewportSize,
}: UseCharacterGraphCanvasLayoutStateParams): UseCharacterGraphCanvasLayoutStateResult {
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [layoutState, setLayoutState] = useState<LayoutComputationState>({
    error: null,
    graph: null,
    isComputing: false,
    nodes: [],
    progress: 0,
  });
  const [nodePositionState, setNodePositionState] = useState<NodePositionState>({
    graph: null,
    positions: {},
    stageHeight: STAGE_HEIGHT,
  });

  const stageHeight = useMemo(
    () => getResponsiveCharacterGraphStageHeight(viewportSize, isMobile),
    [isMobile, viewportSize],
  );
  const stageSize = useMemo<CharacterGraphStageSize>(
    () => getCharacterGraphStageSize(stageHeight),
    [stageHeight],
  );

  useEffect(() => {
    if (!graph) {
      setLayoutState({
        error: null,
        graph: null,
        isComputing: false,
        nodes: [],
        progress: 0,
      });
      return;
    }

    const controller = new AbortController();

    async function run(): Promise<void> {
      const currentGraph = graph;
      if (!currentGraph) {
        return;
      }

      setLayoutState((current) => ({
        error: null,
        graph: currentGraph,
        isComputing: true,
        nodes: current.graph === currentGraph ? current.nodes : [],
        progress: 0,
      }));

      try {
        const nodes = await runGraphLayoutTask(
          {
            nodes: currentGraph.nodes,
            edges: currentGraph.edges,
          },
          {
            signal: controller.signal,
            onProgress: (progress: GraphLayoutProgress) => {
              setLayoutState((current) => {
                if (current.graph !== currentGraph) {
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
          graph: currentGraph,
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
          graph: currentGraph,
          isComputing: false,
          nodes: [],
          progress: 0,
        });
      }
    }

    run();

    return () => {
      controller.abort();
    };
  }, [graph, layoutRevision]);

  const computedBaseNodes = useMemo(
    () => (layoutState.graph === graph ? layoutState.nodes : []),
    [graph, layoutState.graph, layoutState.nodes],
  );
  const isComputing = layoutState.graph === graph && layoutState.isComputing;
  const error = layoutState.graph === graph ? layoutState.error : null;
  const progress = layoutState.graph === graph ? layoutState.progress : 0;
  const stageScaleY = stageHeight / STAGE_HEIGHT;
  const baseNodes = useMemo(
    () => computedBaseNodes.map((node) => ({
      ...node,
      y: Number((node.y * stageScaleY).toFixed(2)),
      anchorY: Number((node.anchorY * stageScaleY).toFixed(2)),
    })),
    [computedBaseNodes, stageScaleY],
  );
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

  const nodes = useMemo(
    () => baseNodes.map((node) => ({
      ...node,
      x: nodePositions[node.id]?.x ?? node.x,
      y: nodePositions[node.id]?.y ?? node.y,
    })),
    [baseNodes, nodePositions],
  );

  const positionMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const edges = useMemo(() => {
    if (!graph) {
      return [];
    }

    return graph.edges
      .map((edge, index) => {
        const source = positionMap.get(edge.source);
        const target = positionMap.get(edge.target);
        if (!source || !target) {
          return null;
        }

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
    if (!graph) {
      return [];
    }

    const progressPercent = graph.meta.totalChapters > 0
      ? Math.round((graph.meta.analyzedChapters / graph.meta.totalChapters) * 100)
      : 0;
    return [
      t('characterGraph.metaProgress', { percent: progressPercent }),
      t('characterGraph.metaCharacters', { count: graph.meta.nodeCount }),
      t('characterGraph.metaRelationships', { count: graph.meta.edgeCount }),
    ];
  }, [graph, t]);

  const setNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    if (!graph) {
      return;
    }

    setNodePositionState((current) => {
      const currentPositions = current.graph === graph && current.stageHeight === stageHeight
        ? current.positions
        : {};
      return {
        graph,
        stageHeight,
        positions: {
          ...currentPositions,
          [nodeId]: position,
        },
      };
    });
  }, [graph, stageHeight]);

  const resetLayoutState = useCallback(() => {
    setNodePositionState({
      graph,
      stageHeight,
      positions: {},
    });
    setLayoutRevision((current) => current + 1);
  }, [graph, stageHeight]);

  return {
    baseNodes,
    edges,
    error,
    isComputing,
    message: isComputing ? getLayoutMessage(progress, t) : null,
    nodes,
    progress,
    resetLayoutState,
    setNodePosition,
    stageHeight,
    stageMeta,
    stageSize,
  };
}
