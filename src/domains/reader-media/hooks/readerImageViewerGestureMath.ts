import type {
  GestureState,
  PanGestureIntent,
} from './readerImageViewerGestureTypes';
import type {
  ReaderImageViewerPoint,
  ReaderImageViewerTransformState,
} from '../utils/readerImageViewerTypes';
import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';

import { peekReaderImageDimensions } from '../utils/readerImageResourceCache';
import {
  PAN_DIRECTION_LOCK_RATIO,
} from '../utils/readerImageViewerTransform';

export function createInitialNaturalImageSize(
  novelId: number,
  entry: ReaderImageGalleryEntry,
) {
  const cachedDimensions = peekReaderImageDimensions(novelId, entry.imageKey);
  if (!cachedDimensions || cachedDimensions.width <= 0 || cachedDimensions.height <= 0) {
    return null;
  }

  return {
    height: cachedDimensions.height,
    width: cachedDimensions.width,
  };
}

export function createGestureState(
  point: ReaderImageViewerPoint,
  pointerType: string,
  startTransformState: ReaderImageViewerTransformState,
  timeStamp: number,
): GestureState {
  return {
    lastPoint: point,
    lastTime: timeStamp,
    panIntent: pointerType === 'mouse' ? 'navigate' : 'undecided',
    startPoint: point,
    startScale: startTransformState.scale,
    startTime: timeStamp,
    startTranslateX: startTransformState.translateX,
    startTranslateY: startTransformState.translateY,
    type: 'pan',
  };
}

export function resolvePointerTimeStamp(timeStamp: number): number {
  return timeStamp > 0 ? timeStamp : Date.now();
}

export function updateGestureVelocityState(
  gesture: GestureState,
  point: ReaderImageViewerPoint,
  timeStamp: number,
): GestureState {
  return {
    ...gesture,
    lastPoint: point,
    lastTime: timeStamp,
  };
}

export function readReleaseVelocityY(
  gesture: GestureState,
  point: ReaderImageViewerPoint,
  timeStamp: number,
): number {
  const elapsedFromLastMove = Math.max(1, timeStamp - gesture.lastTime);
  if (elapsedFromLastMove <= 48) {
    return ((point.y - gesture.lastPoint.y) / elapsedFromLastMove) * 1000;
  }

  return ((point.y - gesture.startPoint.y) / Math.max(1, timeStamp - gesture.startTime)) * 1000;
}

export function resolvePanIntent(
  rawDeltaX: number,
  rawDeltaY: number,
  pointerType: string,
): PanGestureIntent {
  if (
    pointerType !== 'mouse'
    && rawDeltaY > 0
    && Math.abs(rawDeltaY) > Math.abs(rawDeltaX) * PAN_DIRECTION_LOCK_RATIO
  ) {
    return 'dismiss';
  }

  if (Math.abs(rawDeltaX) > Math.abs(rawDeltaY) * PAN_DIRECTION_LOCK_RATIO) {
    return 'navigate';
  }

  return 'undecided';
}
