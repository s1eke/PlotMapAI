import type {
  ReaderImageViewerNaturalImageSize,
  ReaderImageViewerPoint,
  ReaderImageViewerSurfaceTransition,
  ReaderImageViewerViewportSize,
} from './readerImageViewerTypes';

export const VIEWPORT_PADDING_PX = 24;
export const PINCH_CLOSE_THRESHOLD = 0.92;
export const SCALE_SAFE_MAX = 4;
export const DOUBLE_TAP_ZOOM_SCALE = 2;
export const DOUBLE_TAP_MAX_DELAY_MS = 320;
export const DOUBLE_TAP_MAX_DISTANCE_PX = 28;
export const TAP_GESTURE_TOLERANCE_PX = 10;
export const SWIPE_NAVIGATION_THRESHOLD_PX = 56;
export const EDGE_SWIPE_THRESHOLD_PX = 72;
export const OVERDRAG_DAMPING = 0.32;
export const TRANSLATE_SWIPE_DAMPING = 0.48;
export const TRANSLATE_VERTICAL_DAMPING = 0.18;
export const TRANSFORM_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const TRANSFORM_ANIMATION_MS = 220;
export const SINGLE_CLICK_CLOSE_DELAY_MS = DOUBLE_TAP_MAX_DELAY_MS;
export const IMAGE_SWITCH_ANIMATION_DURATION_S = 0.26;
export const IMAGE_SWITCH_DISTANCE_RATIO = 0.58;
export const IMAGE_SWITCH_MAX_OFFSET_PX = 520;
export const IMAGE_SWITCH_MIN_OFFSET_PX = 180;

interface AnchoredTransform {
  [key: string]: number;
  opacity: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

interface ImageSwitchTransform {
  [key: string]: number;
  opacity: number;
  x: number;
}

export interface ApplyScaleAroundPointParams {
  nextScale: number;
  point: ReaderImageViewerPoint;
  scale: number;
  targetRect: DOMRect;
  translateX: number;
  translateY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function readReaderImageViewerViewportSize(): ReaderImageViewerViewportSize {
  if (typeof window === 'undefined') {
    return { height: 800, width: 600 };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

export function applyViewerDamping(value: number, limit: number): number {
  if (limit <= 0) {
    return value * TRANSLATE_SWIPE_DAMPING;
  }

  if (value > limit) {
    return limit + (value - limit) * OVERDRAG_DAMPING;
  }
  if (value < -limit) {
    return -limit + (value + limit) * OVERDRAG_DAMPING;
  }

  return value;
}

export function getPointDistance(
  first: ReaderImageViewerPoint,
  second: ReaderImageViewerPoint,
): number {
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  return Math.hypot(deltaX, deltaY);
}

export function getPointMidpoint(
  first: ReaderImageViewerPoint,
  second: ReaderImageViewerPoint,
): ReaderImageViewerPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export function computeTargetRect(
  viewport: ReaderImageViewerViewportSize,
  naturalSize: ReaderImageViewerNaturalImageSize | null,
): DOMRect {
  const paddedWidth = Math.max(1, viewport.width - VIEWPORT_PADDING_PX * 2);
  const paddedHeight = Math.max(1, viewport.height - VIEWPORT_PADDING_PX * 2);
  const aspectRatio = naturalSize && naturalSize.width > 0 && naturalSize.height > 0
    ? naturalSize.width / naturalSize.height
    : 1;

  let width = paddedWidth;
  let height = width / aspectRatio;
  if (height > paddedHeight) {
    height = paddedHeight;
    width = height * aspectRatio;
  }

  const left = (viewport.width - width) / 2;
  const top = (viewport.height - height) / 2;
  return new DOMRect(left, top, width, height);
}

export function getMaxScale(
  targetRect: DOMRect,
  naturalSize: ReaderImageViewerNaturalImageSize | null,
): number {
  if (!naturalSize || targetRect.width <= 0 || targetRect.height <= 0) {
    return 1;
  }

  const widthScale = naturalSize.width / targetRect.width;
  const heightScale = naturalSize.height / targetRect.height;
  const pixelPerfectScale = Math.max(widthScale, heightScale);
  return clamp(Math.max(DOUBLE_TAP_ZOOM_SCALE, pixelPerfectScale), 1, SCALE_SAFE_MAX);
}

export function isTapWithinThreshold(
  startPoint: ReaderImageViewerPoint,
  endPoint: ReaderImageViewerPoint,
): boolean {
  return Math.abs(endPoint.x - startPoint.x) <= TAP_GESTURE_TOLERANCE_PX
    && Math.abs(endPoint.y - startPoint.y) <= TAP_GESTURE_TOLERANCE_PX;
}

export function getTranslateBounds(targetRect: DOMRect, scale: number): ReaderImageViewerPoint {
  const extraWidth = Math.max(0, targetRect.width * scale - targetRect.width);
  const extraHeight = Math.max(0, targetRect.height * scale - targetRect.height);
  return {
    x: extraWidth / 2,
    y: extraHeight / 2,
  };
}

export function clampTranslate(
  targetRect: DOMRect,
  scale: number,
  translateX: number,
  translateY: number,
): ReaderImageViewerPoint {
  const bounds = getTranslateBounds(targetRect, scale);
  return {
    x: clamp(translateX, -bounds.x, bounds.x),
    y: clamp(translateY, -bounds.y, bounds.y),
  };
}

export function applyScaleAroundPoint(
  params: ApplyScaleAroundPointParams,
): ReaderImageViewerPoint {
  const rectCenterX = params.targetRect.left + params.targetRect.width / 2;
  const rectCenterY = params.targetRect.top + params.targetRect.height / 2;
  const localPoint = {
    x: params.point.x - rectCenterX,
    y: params.point.y - rectCenterY,
  };

  if (params.scale <= 0) {
    return {
      x: params.translateX,
      y: params.translateY,
    };
  }

  const scaleRatio = params.nextScale / params.scale;
  return {
    x: params.translateX * scaleRatio + localPoint.x * (1 - scaleRatio),
    y: params.translateY * scaleRatio + localPoint.y * (1 - scaleRatio),
  };
}

export function buildAnchoredTransform(
  originRect: DOMRect | null,
  targetRect: DOMRect,
): AnchoredTransform {
  if (!originRect || originRect.width <= 0 || originRect.height <= 0) {
    return {
      opacity: 0,
      scale: 0.96,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
    };
  }

  return {
    opacity: 1,
    scale: 1,
    scaleX: originRect.width / targetRect.width,
    scaleY: originRect.height / targetRect.height,
    x: originRect.left + originRect.width / 2 - (targetRect.left + targetRect.width / 2),
    y: originRect.top + originRect.height / 2 - (targetRect.top + targetRect.height / 2),
  };
}

export function getImageSwitchOffset(viewport: ReaderImageViewerViewportSize): number {
  return clamp(
    viewport.width * IMAGE_SWITCH_DISTANCE_RATIO,
    IMAGE_SWITCH_MIN_OFFSET_PX,
    IMAGE_SWITCH_MAX_OFFSET_PX,
  );
}

export function buildImageSwitchTransform(
  transition: ReaderImageViewerSurfaceTransition,
  directionMultiplier: 1 | -1,
): ImageSwitchTransform {
  if (transition.kind !== 'slide' || transition.direction === 0) {
    return {
      opacity: 1,
      x: 0,
    };
  }

  return {
    opacity: 1,
    x: transition.direction * transition.slideOffset * directionMultiplier,
  };
}
