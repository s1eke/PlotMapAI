import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react';

import type { CharacterGraphResponse } from '@shared/contracts';

import {
  INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
  reduceCharacterGraphCanvasGesture,
  type CharacterGraphCanvasGestureCommand,
  type CharacterGraphCanvasGestureState,
} from './characterGraphCanvasGestureMachine';
import type { LayoutNode, ZoomState } from '../utils/characterGraphLayout';
import { MAX_ZOOM_SCALE, MIN_ZOOM_SCALE, viewportPointToGraphPoint } from '../utils/characterGraphLayout';
import type {
  CharacterGraphStageSize,
  CharacterGraphViewportSize,
} from '../utils/characterGraphViewportTransform';
import { zoomViewportAroundPoint } from '../utils/characterGraphViewportTransform';

interface PointerSnapshot {
  clientX: number;
  clientY: number;
  viewportX: number;
  viewportY: number;
}

interface UseCharacterGraphCanvasBindingsParams {
  canPanCanvas: boolean;
  clearSelection: () => void;
  graph: CharacterGraphResponse | null;
  isMobile: boolean;
  onViewportSizeChange: (viewportSize: CharacterGraphViewportSize) => void;
  setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
  setNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setViewportZoom: (zoom: ZoomState) => void;
  stageHeight: number;
  stageSize: CharacterGraphStageSize;
  selectNode: (nodeId: string) => void;
  zoomState: ZoomState;
}

interface UseCharacterGraphCanvasBindingsResult {
  bindings: {
    onCanvasPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
    onNodeMouseEnter: (nodeId: string) => void;
    onNodeMouseLeave: (nodeId: string) => void;
    onNodePointerDown: (event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => void;
    svgRef: RefObject<SVGSVGElement | null>;
  };
  gesture: {
    isInteracting: boolean;
    isPanning: boolean;
  };
  resetInteraction: () => void;
}

const DESKTOP_POINTER_MOVE_THRESHOLD = 3;
const MOBILE_POINTER_MOVE_THRESHOLD = 10;
const MIN_PINCH_DISTANCE = 12;

function getPointerMoveThreshold(isMobile: boolean): number {
  return isMobile ? MOBILE_POINTER_MOVE_THRESHOLD : DESKTOP_POINTER_MOVE_THRESHOLD;
}

function createViewportSizeFromRect(rect: DOMRect): CharacterGraphViewportSize | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    width: rect.width,
    height: rect.height,
  };
}

function shouldPreventPointerMove(commands: CharacterGraphCanvasGestureCommand[]): boolean {
  return commands.some((command) => (
    command.type === 'queueNodePosition' || command.type === 'queueViewportZoom'
  ));
}

export function useCharacterGraphCanvasBindings({
  canPanCanvas,
  clearSelection,
  graph,
  isMobile,
  onViewportSizeChange,
  setHoveredNodeId,
  setNodePosition,
  setViewportZoom,
  stageHeight,
  stageSize,
  selectNode,
  zoomState,
}: UseCharacterGraphCanvasBindingsParams): UseCharacterGraphCanvasBindingsResult {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const activePointersRef = useRef<Map<number, PointerSnapshot>>(new Map());
  const gestureStateRef = useRef<CharacterGraphCanvasGestureState>(
    INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
  );
  const interactionFrameRef = useRef<number | null>(null);
  const queuedViewportZoomRef = useRef<ZoomState | null>(null);
  const queuedNodePositionRef = useRef<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);
  const zoomStateRef = useRef(zoomState);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    zoomStateRef.current = zoomState;
  }, [zoomState]);

  const clearInteractionQueues = useCallback(() => {
    queuedViewportZoomRef.current = null;
    queuedNodePositionRef.current = null;
  }, []);

  const flushInteractionUpdates = useCallback(() => {
    interactionFrameRef.current = null;

    if (queuedNodePositionRef.current && graph) {
      const nextNodePosition = queuedNodePositionRef.current;
      queuedNodePositionRef.current = null;
      setNodePosition(nextNodePosition.nodeId, nextNodePosition.position);
    }

    if (queuedViewportZoomRef.current && graph) {
      const nextZoom = queuedViewportZoomRef.current;
      queuedViewportZoomRef.current = null;
      setViewportZoom(nextZoom);
    }
  }, [graph, setNodePosition, setViewportZoom]);

  const scheduleInteractionFlush = useCallback(() => {
    if (interactionFrameRef.current !== null) {
      return;
    }

    interactionFrameRef.current = window.requestAnimationFrame(flushInteractionUpdates);
  }, [flushInteractionUpdates]);

  const applyGestureCommands = useCallback((commands: CharacterGraphCanvasGestureCommand[]) => {
    commands.forEach((command) => {
      switch (command.type) {
        case 'queueNodePosition':
          queuedNodePositionRef.current = {
            nodeId: command.nodeId,
            position: command.position,
          };
          scheduleInteractionFlush();
          break;
        case 'queueViewportZoom':
          queuedViewportZoomRef.current = command.zoom;
          scheduleInteractionFlush();
          break;
        case 'setInteracting':
          setIsInteracting(command.value);
          break;
        case 'setPanning':
          setIsPanning(command.value);
          break;
        case 'selectNode':
          selectNode(command.nodeId);
          break;
        case 'clearSelection':
          clearSelection();
          break;
        case 'clearInteractionQueues':
          clearInteractionQueues();
          break;
        default:
          break;
      }
    });
  }, [
    clearInteractionQueues,
    clearSelection,
    scheduleInteractionFlush,
    selectNode,
  ]);

  const dispatchGestureEvent = useCallback((
    event: Parameters<typeof reduceCharacterGraphCanvasGesture>[1],
  ) => {
    const result = reduceCharacterGraphCanvasGesture(gestureStateRef.current, event);
    gestureStateRef.current = result.state;
    applyGestureCommands(result.commands);
    return result;
  }, [applyGestureCommands]);

  const resetInteraction = useCallback(() => {
    activePointersRef.current.clear();
    gestureStateRef.current = INITIAL_CHARACTER_GRAPH_GESTURE_STATE;
    clearInteractionQueues();
    setIsInteracting(false);
    setIsPanning(false);
  }, [clearInteractionQueues]);

  const getViewportPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const rect = svg.getBoundingClientRect();
    const viewportSize = createViewportSizeFromRect(rect);
    if (!viewportSize) {
      return null;
    }

    return {
      x: ((clientX - rect.left) / viewportSize.width) * stageSize.width,
      y: ((clientY - rect.top) / viewportSize.height) * stageHeight,
    };
  }, [stageHeight, stageSize.width]);

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
    dispatchGestureEvent({
      type: 'pinchStart',
      initialDistance,
      initialGraphPoint: viewportPointToGraphPoint(initialCenter, zoomStateRef.current),
      initialScale: zoomStateRef.current.scale,
      pointerIds: [firstId, secondId],
    });
    return true;
  }, [dispatchGestureEvent, isMobile]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const viewportPoint = getViewportPoint(event.clientX, event.clientY);
      const existingPointer = activePointersRef.current.get(event.pointerId);
      if (!viewportPoint || !existingPointer) {
        return;
      }

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

        dispatchGestureEvent({
          type: 'pinchMove',
          currentCenter: {
            x: (first.viewportX + second.viewportX) / 2,
            y: (first.viewportY + second.viewportY) / 2,
          },
          currentDistance,
          stageSize,
        });
        return;
      }

      const result = dispatchGestureEvent({
        type: 'pointerMove',
        clientPoint: {
          x: event.clientX,
          y: event.clientY,
        },
        currentZoom: zoomStateRef.current,
        pointerId: event.pointerId,
        stageSize,
        threshold: getPointerMoveThreshold(isMobile),
        viewportPoint,
      });
      if (shouldPreventPointerMove(result.commands)) {
        event.preventDefault();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);
      dispatchGestureEvent({
        type: 'pointerUp',
        pointerId: event.pointerId,
      });
    };

    const handlePointerCancel = (event: PointerEvent) => {
      activePointersRef.current.delete(event.pointerId);
      dispatchGestureEvent({ type: 'pointerCancel' });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dispatchGestureEvent, getViewportPoint, isMobile, stageSize]);

  useEffect(() => {
    return () => {
      resetInteraction();
      if (interactionFrameRef.current !== null) {
        cancelAnimationFrame(interactionFrameRef.current);
      }
    };
  }, [resetInteraction]);

  useEffect(() => {
    const element = svgRef.current;
    if (!element) {
      return;
    }

    const updateViewportSize = () => {
      const rect = element.getBoundingClientRect();
      const nextViewportSize = createViewportSizeFromRect(rect);
      if (!nextViewportSize) {
        return;
      }

      onViewportSizeChange(nextViewportSize);
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [graph, isMobile, onViewportSizeChange]);

  const handleWheel = useCallback((event: WheelEvent) => {
    const viewportPoint = getViewportPoint(event.clientX, event.clientY);
    if (!viewportPoint) {
      return;
    }

    event.preventDefault();
    const currentZoom = zoomStateRef.current;
    const nextScale = Math.min(
      Number((currentZoom.scale * Math.exp(-event.deltaY * 0.0015)).toFixed(4)),
      MAX_ZOOM_SCALE,
    );
    const clampedScale = Math.max(nextScale, MIN_ZOOM_SCALE);
    if (clampedScale === currentZoom.scale) {
      return;
    }

    setViewportZoom(zoomViewportAroundPoint(viewportPoint, currentZoom, clampedScale, stageSize));
  }, [getViewportPoint, setViewportZoom, stageSize]);

  useLayoutEffect(() => {
    const element = svgRef.current;
    if (!element) {
      return;
    }

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const onNodePointerDown = useCallback(
    (event: ReactPointerEvent<SVGGElement>, node: LayoutNode) => {
      const viewportPoint = getViewportPoint(event.clientX, event.clientY);
      if (!viewportPoint) {
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
        event.stopPropagation();
        return;
      }

      const point = viewportPointToGraphPoint(viewportPoint, zoomStateRef.current);
      dispatchGestureEvent({
        type: 'nodePointerDown',
        clientPoint: {
          x: event.clientX,
          y: event.clientY,
        },
        dragOffset: {
          x: point.x - node.x,
          y: point.y - node.y,
        },
        nodeId: node.id,
        pointerId: event.pointerId,
        radius: node.radius,
      });
      setHoveredNodeId(node.id);
      event.preventDefault();
      event.stopPropagation();
    },
    [dispatchGestureEvent, getViewportPoint, maybeStartPinchGesture, setHoveredNodeId],
  );

  const onCanvasPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const viewportPoint = getViewportPoint(event.clientX, event.clientY);
    if (!viewportPoint) {
      clearSelection();
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

    const result = dispatchGestureEvent({
      type: 'canvasPointerDown',
      canPanCanvas,
      originOffset: {
        x: zoomStateRef.current.offsetX,
        y: zoomStateRef.current.offsetY,
      },
      pointerId: event.pointerId,
      viewportPoint,
    });
    if (result.state.kind !== 'idle') {
      event.preventDefault();
    }
  }, [
    canPanCanvas,
    clearSelection,
    dispatchGestureEvent,
    getViewportPoint,
    maybeStartPinchGesture,
  ]);

  const onNodeMouseEnter = useCallback((nodeId: string) => {
    setHoveredNodeId(nodeId);
  }, [setHoveredNodeId]);

  const onNodeMouseLeave = useCallback((nodeId: string) => {
    setHoveredNodeId((current) => (current === nodeId ? null : current));
  }, [setHoveredNodeId]);

  return {
    bindings: {
      onCanvasPointerDown,
      onNodeMouseEnter,
      onNodeMouseLeave,
      onNodePointerDown,
      svgRef,
    },
    gesture: {
      isInteracting,
      isPanning,
    },
    resetInteraction,
  };
}
