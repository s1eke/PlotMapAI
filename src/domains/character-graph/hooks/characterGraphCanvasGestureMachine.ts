import { clamp, MAX_ZOOM_SCALE, MIN_ZOOM_SCALE, viewportPointToGraphPoint, type ZoomState } from '../utils/characterGraphLayout';
import {
  clampNodeToVisibleViewport,
  clampZoomOffsetForStage,
  panCharacterGraphViewport,
  type CharacterGraphStageSize,
} from '../utils/characterGraphViewportTransform';

export interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  radius: number;
  startX: number;
  startY: number;
}

export interface PanState {
  startX: number;
  startY: number;
  originOffsetX: number;
  originOffsetY: number;
}

export type CharacterGraphCanvasGestureState =
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

export type CharacterGraphCanvasGestureCommand =
  | { type: 'queueNodePosition'; nodeId: string; position: { x: number; y: number } }
  | { type: 'queueViewportZoom'; zoom: ZoomState }
  | { type: 'setInteracting'; value: boolean }
  | { type: 'setPanning'; value: boolean }
  | { type: 'selectNode'; nodeId: string }
  | { type: 'clearSelection' }
  | { type: 'clearInteractionQueues' };

interface GestureTransitionResult {
  commands: CharacterGraphCanvasGestureCommand[];
  state: CharacterGraphCanvasGestureState;
}

interface NodePointerDownEvent {
  type: 'nodePointerDown';
  clientPoint: { x: number; y: number };
  dragOffset: { x: number; y: number };
  nodeId: string;
  pointerId: number;
  radius: number;
}

interface CanvasPointerDownEvent {
  type: 'canvasPointerDown';
  canPanCanvas: boolean;
  originOffset: { x: number; y: number };
  pointerId: number;
  viewportPoint: { x: number; y: number };
}

interface PinchStartEvent {
  type: 'pinchStart';
  initialDistance: number;
  initialGraphPoint: { x: number; y: number };
  initialScale: number;
  pointerIds: [number, number];
}

interface PointerMoveEvent {
  type: 'pointerMove';
  clientPoint: { x: number; y: number };
  currentZoom: ZoomState;
  pointerId: number;
  stageSize: CharacterGraphStageSize;
  threshold: number;
  viewportPoint: { x: number; y: number };
}

interface PinchMoveEvent {
  type: 'pinchMove';
  currentCenter: { x: number; y: number };
  currentDistance: number;
  stageSize: CharacterGraphStageSize;
}

interface PointerUpEvent {
  type: 'pointerUp';
  pointerId: number;
}

interface PointerCancelEvent {
  type: 'pointerCancel';
}

interface ResetEvent {
  type: 'reset';
}

export type CharacterGraphCanvasGestureEvent =
  | CanvasPointerDownEvent
  | NodePointerDownEvent
  | PinchMoveEvent
  | PinchStartEvent
  | PointerCancelEvent
  | PointerMoveEvent
  | PointerUpEvent
  | ResetEvent;

export const INITIAL_CHARACTER_GRAPH_GESTURE_STATE: CharacterGraphCanvasGestureState = {
  kind: 'idle',
};

function createResetCommands(): CharacterGraphCanvasGestureCommand[] {
  return [
    { type: 'clearInteractionQueues' },
    { type: 'setInteracting', value: false },
    { type: 'setPanning', value: false },
  ];
}

function reduceNodePointerMove(
  state: Extract<CharacterGraphCanvasGestureState, { kind: 'nodePending' | 'nodeDrag' }>,
  event: PointerMoveEvent,
): GestureTransitionResult {
  if (event.pointerId !== state.pointerId) {
    return { state, commands: [] };
  }

  const point = viewportPointToGraphPoint(event.viewportPoint, event.currentZoom);
  const deltaX = event.clientPoint.x - state.drag.startX;
  const deltaY = event.clientPoint.y - state.drag.startY;
  const commands: CharacterGraphCanvasGestureCommand[] = [];
  let nextState: CharacterGraphCanvasGestureState = state;

  if (
    state.kind === 'nodePending'
    && (Math.abs(deltaX) > event.threshold || Math.abs(deltaY) > event.threshold)
  ) {
    nextState = {
      kind: 'nodeDrag',
      pointerId: state.pointerId,
      drag: state.drag,
    };
    commands.push({ type: 'setInteracting', value: true });
  }

  if (nextState.kind !== 'nodeDrag') {
    return {
      state: nextState,
      commands,
    };
  }

  commands.push({
    type: 'queueNodePosition',
    nodeId: nextState.drag.nodeId,
    position: clampNodeToVisibleViewport(
      {
        x: point.x - nextState.drag.offsetX,
        y: point.y - nextState.drag.offsetY,
      },
      nextState.drag.radius,
      event.currentZoom,
      event.stageSize,
    ),
  });

  return {
    state: nextState,
    commands,
  };
}

function reducePanPointerMove(
  state: Extract<CharacterGraphCanvasGestureState, { kind: 'panPending' | 'pan' }>,
  event: PointerMoveEvent,
): GestureTransitionResult {
  if (event.pointerId !== state.pointerId) {
    return { state, commands: [] };
  }

  const deltaX = event.viewportPoint.x - state.pan.startX;
  const deltaY = event.viewportPoint.y - state.pan.startY;
  const commands: CharacterGraphCanvasGestureCommand[] = [];
  let nextState: CharacterGraphCanvasGestureState = state;

  if (
    state.kind === 'panPending'
    && (Math.abs(deltaX) > event.threshold || Math.abs(deltaY) > event.threshold)
  ) {
    nextState = {
      kind: 'pan',
      pointerId: state.pointerId,
      pan: state.pan,
    };
    commands.push(
      { type: 'setInteracting', value: true },
      { type: 'setPanning', value: true },
    );
  }

  if (nextState.kind !== 'pan') {
    return {
      state: nextState,
      commands,
    };
  }

  commands.push({
    type: 'queueViewportZoom',
    zoom: panCharacterGraphViewport(
      event.stageSize,
      event.currentZoom.scale,
      nextState.pan.originOffsetX,
      nextState.pan.originOffsetY,
      deltaX,
      deltaY,
    ),
  });

  return {
    state: nextState,
    commands,
  };
}

export function reduceCharacterGraphCanvasGesture(
  state: CharacterGraphCanvasGestureState,
  event: CharacterGraphCanvasGestureEvent,
): GestureTransitionResult {
  switch (event.type) {
    case 'nodePointerDown':
      return {
        state: {
          kind: 'nodePending',
          pointerId: event.pointerId,
          drag: {
            nodeId: event.nodeId,
            offsetX: event.dragOffset.x,
            offsetY: event.dragOffset.y,
            radius: event.radius,
            startX: event.clientPoint.x,
            startY: event.clientPoint.y,
          },
        },
        commands: [],
      };

    case 'canvasPointerDown':
      if (!event.canPanCanvas) {
        return {
          state: INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
          commands: [{ type: 'clearSelection' }],
        };
      }

      return {
        state: {
          kind: 'panPending',
          pointerId: event.pointerId,
          pan: {
            startX: event.viewportPoint.x,
            startY: event.viewportPoint.y,
            originOffsetX: event.originOffset.x,
            originOffsetY: event.originOffset.y,
          },
        },
        commands: [],
      };

    case 'pinchStart':
      return {
        state: {
          kind: 'pinch',
          pointerIds: event.pointerIds,
          initialDistance: event.initialDistance,
          initialScale: event.initialScale,
          initialGraphPoint: event.initialGraphPoint,
        },
        commands: [
          { type: 'setInteracting', value: true },
          { type: 'setPanning', value: true },
        ],
      };

    case 'pinchMove': {
      if (state.kind !== 'pinch') {
        return { state, commands: [] };
      }

      if (event.currentDistance <= 0) {
        return { state, commands: [] };
      }

      const nextScale = clamp(
        Number(((state.initialScale * event.currentDistance) / state.initialDistance).toFixed(4)),
        MIN_ZOOM_SCALE,
        MAX_ZOOM_SCALE,
      );

      return {
        state,
        commands: [
          {
            type: 'queueViewportZoom',
            zoom: clampZoomOffsetForStage(
              event.stageSize,
              nextScale,
              event.currentCenter.x - state.initialGraphPoint.x * nextScale,
              event.currentCenter.y - state.initialGraphPoint.y * nextScale,
            ),
          },
        ],
      };
    }

    case 'pointerMove':
      if (state.kind === 'nodePending' || state.kind === 'nodeDrag') {
        return reduceNodePointerMove(state, event);
      }

      if (state.kind === 'panPending' || state.kind === 'pan') {
        return reducePanPointerMove(state, event);
      }

      return { state, commands: [] };

    case 'pointerUp':
      if (state.kind === 'pinch') {
        return {
          state: INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
          commands: createResetCommands(),
        };
      }

      if (
        (state.kind === 'nodePending'
          || state.kind === 'nodeDrag'
          || state.kind === 'panPending'
          || state.kind === 'pan')
        && event.pointerId !== state.pointerId
      ) {
        return { state, commands: [] };
      }

      if (state.kind === 'nodePending') {
        return {
          state: INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
          commands: [
            { type: 'selectNode', nodeId: state.drag.nodeId },
            ...createResetCommands(),
          ],
        };
      }

      if (state.kind === 'panPending') {
        return {
          state: INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
          commands: [
            { type: 'clearSelection' },
            ...createResetCommands(),
          ],
        };
      }

      if (state.kind === 'nodeDrag' || state.kind === 'pan') {
        return {
          state: INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
          commands: createResetCommands(),
        };
      }

      return { state, commands: [] };

    case 'pointerCancel':
    case 'reset':
      return {
        state: INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
        commands: createResetCommands(),
      };

    default:
      return { state, commands: [] };
  }
}
