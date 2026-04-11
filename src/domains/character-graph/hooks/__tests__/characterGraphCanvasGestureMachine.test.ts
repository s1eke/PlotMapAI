import { describe, expect, it } from 'vitest';

import {
  INITIAL_CHARACTER_GRAPH_GESTURE_STATE,
  reduceCharacterGraphCanvasGesture,
} from '../characterGraphCanvasGestureMachine';
import { getCharacterGraphStageSize } from '../../utils/characterGraphViewportTransform';

describe('characterGraphCanvasGestureMachine', () => {
  const stageSize = getCharacterGraphStageSize(1200);

  it('selects a node when a pending node gesture ends without dragging', () => {
    const pending = reduceCharacterGraphCanvasGesture(INITIAL_CHARACTER_GRAPH_GESTURE_STATE, {
      type: 'nodePointerDown',
      clientPoint: { x: 50, y: 50 },
      dragOffset: { x: 8, y: 10 },
      nodeId: 'hero',
      pointerId: 1,
      radius: 44,
    });

    const finished = reduceCharacterGraphCanvasGesture(pending.state, {
      type: 'pointerUp',
      pointerId: 1,
    });

    expect(finished.state.kind).toBe('idle');
    expect(finished.commands).toEqual(expect.arrayContaining([
      { type: 'selectNode', nodeId: 'hero' },
      { type: 'setInteracting', value: false },
      { type: 'setPanning', value: false },
    ]));
  });

  it('promotes node pending gestures into drags after crossing the threshold', () => {
    const pending = reduceCharacterGraphCanvasGesture(INITIAL_CHARACTER_GRAPH_GESTURE_STATE, {
      type: 'nodePointerDown',
      clientPoint: { x: 50, y: 50 },
      dragOffset: { x: 8, y: 10 },
      nodeId: 'hero',
      pointerId: 1,
      radius: 44,
    });

    const dragged = reduceCharacterGraphCanvasGesture(pending.state, {
      type: 'pointerMove',
      clientPoint: { x: 90, y: 84 },
      currentZoom: { scale: 1.4, offsetX: -120, offsetY: -80 },
      pointerId: 1,
      stageSize,
      threshold: 10,
      viewportPoint: { x: 700, y: 540 },
    });

    expect(dragged.state.kind).toBe('nodeDrag');
    expect(dragged.commands).toEqual(expect.arrayContaining([
      { type: 'setInteracting', value: true },
      expect.objectContaining({
        type: 'queueNodePosition',
        nodeId: 'hero',
      }),
    ]));
  });

  it('promotes pan pending gestures into pans and queues viewport updates', () => {
    const pending = reduceCharacterGraphCanvasGesture(INITIAL_CHARACTER_GRAPH_GESTURE_STATE, {
      type: 'canvasPointerDown',
      canPanCanvas: true,
      originOffset: { x: -40, y: 12 },
      pointerId: 3,
      viewportPoint: { x: 420, y: 360 },
    });

    const panned = reduceCharacterGraphCanvasGesture(pending.state, {
      type: 'pointerMove',
      clientPoint: { x: 90, y: 110 },
      currentZoom: { scale: 1.35, offsetX: -40, offsetY: 12 },
      pointerId: 3,
      stageSize,
      threshold: 8,
      viewportPoint: { x: 470, y: 430 },
    });

    expect(panned.state.kind).toBe('pan');
    expect(panned.commands).toEqual(expect.arrayContaining([
      { type: 'setInteracting', value: true },
      { type: 'setPanning', value: true },
      expect.objectContaining({ type: 'queueViewportZoom' }),
    ]));
  });

  it('models pinch start, update, and release as a single gesture lifecycle', () => {
    const pinch = reduceCharacterGraphCanvasGesture(INITIAL_CHARACTER_GRAPH_GESTURE_STATE, {
      type: 'pinchStart',
      initialDistance: 120,
      initialGraphPoint: { x: 480, y: 320 },
      initialScale: 1.1,
      pointerIds: [1, 2],
    });

    expect(pinch.state.kind).toBe('pinch');
    expect(pinch.commands).toEqual(expect.arrayContaining([
      { type: 'setInteracting', value: true },
      { type: 'setPanning', value: true },
    ]));

    const moved = reduceCharacterGraphCanvasGesture(pinch.state, {
      type: 'pinchMove',
      currentCenter: { x: 720, y: 420 },
      currentDistance: 180,
      stageSize,
    });

    expect(moved.commands).toEqual([
      expect.objectContaining({
        type: 'queueViewportZoom',
      }),
    ]);

    const finished = reduceCharacterGraphCanvasGesture(pinch.state, {
      type: 'pointerUp',
      pointerId: 1,
    });

    expect(finished.state.kind).toBe('idle');
    expect(finished.commands).toEqual(expect.arrayContaining([
      { type: 'clearInteractionQueues' },
      { type: 'setInteracting', value: false },
      { type: 'setPanning', value: false },
    ]));
  });

  it('ignores unrelated pointer releases while a single-pointer gesture is active', () => {
    const pending = reduceCharacterGraphCanvasGesture(INITIAL_CHARACTER_GRAPH_GESTURE_STATE, {
      type: 'canvasPointerDown',
      canPanCanvas: true,
      originOffset: { x: 0, y: 0 },
      pointerId: 4,
      viewportPoint: { x: 300, y: 240 },
    });

    const ignored = reduceCharacterGraphCanvasGesture(pending.state, {
      type: 'pointerUp',
      pointerId: 99,
    });

    expect(ignored.state).toEqual(pending.state);
    expect(ignored.commands).toEqual([]);
  });

  it('resets the machine on pointer cancel', () => {
    const pending = reduceCharacterGraphCanvasGesture(INITIAL_CHARACTER_GRAPH_GESTURE_STATE, {
      type: 'nodePointerDown',
      clientPoint: { x: 50, y: 50 },
      dragOffset: { x: 8, y: 10 },
      nodeId: 'hero',
      pointerId: 1,
      radius: 44,
    });

    const canceled = reduceCharacterGraphCanvasGesture(pending.state, {
      type: 'pointerCancel',
    });

    expect(canceled.state.kind).toBe('idle');
    expect(canceled.commands).toEqual(expect.arrayContaining([
      { type: 'clearInteractionQueues' },
      { type: 'setInteracting', value: false },
      { type: 'setPanning', value: false },
    ]));
  });
});
