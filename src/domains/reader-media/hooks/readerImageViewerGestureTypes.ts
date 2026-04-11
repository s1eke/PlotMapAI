import type { MotionValue } from 'motion/react';
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  MutableRefObject,
  SetStateAction,
  SyntheticEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { ReaderImageGalleryEntry } from '@shared/contracts/reader';
import type {
  ReaderImageViewerNaturalImageSize,
  ReaderImageViewerPoint,
  ReaderImageViewerTransformState,
  ReaderImageViewerViewportSize,
} from '../utils/readerImageViewerTypes';

export type PanGestureIntent = 'dismiss' | 'navigate' | 'undecided';

export interface GestureState {
  lastPoint: ReaderImageViewerPoint;
  lastTime: number;
  panIntent: PanGestureIntent;
  startCenter?: ReaderImageViewerPoint;
  startDistance?: number;
  startPoint: ReaderImageViewerPoint;
  startScale: number;
  startTime: number;
  startTranslateX: number;
  startTranslateY: number;
  type: 'pan' | 'pinch';
}

export interface TapState {
  point: ReaderImageViewerPoint;
  pointerType: string;
  timeStamp: number;
}

export interface UseReaderImageViewerGestureParams {
  activeEntry: ReaderImageGalleryEntry;
  activeIndex: number;
  canNavigateNext: boolean;
  canNavigatePrev: boolean;
  consumeDeferredStageClick: () => boolean;
  dismissProgress: MotionValue<number>;
  entries: ReaderImageGalleryEntry[];
  hasImageResource: boolean;
  isNavigationTransitionPending: boolean;
  novelId: number;
  onClearNavigationTransition: () => void;
  onPrepareNavigationTransition: (direction: -1 | 1, targetEntryId: string) => void;
  onRequestClose: () => void;
  onRequestDismissClose: () => void;
  onRequestNavigate: (direction: 'next' | 'prev') => Promise<boolean>;
  suppressDeferredStageClick: () => void;
  viewportSize: ReaderImageViewerViewportSize;
}

export interface UseReaderImageViewerGestureResult {
  handleImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  handlePointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => Promise<void>;
  handleStageClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleStageDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleStageWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  scaleMotionValue: MotionValue<number>;
  surfaceOpacity: MotionValue<number>;
  targetRect: DOMRect;
  translateXMotionValue: MotionValue<number>;
  translateYMotionValue: MotionValue<number>;
}

export interface ReaderImageViewerTransformController {
  animateBackToCenter: () => void;
  animateTransform: (
    nextTransformState: ReaderImageViewerTransformState,
    resetDismissPreview: boolean,
  ) => void;
  beginDragDismissClose: (rawDeltaX: number, rawDeltaY: number) => void;
  clearPendingClose: () => void;
  clearPendingDismissClose: () => void;
  closeIntentTimeoutRef: MutableRefObject<number | null>;
  dismissProgress: MotionValue<number>;
  dragDismissClosingRef: MutableRefObject<boolean>;
  maxScale: number;
  naturalImageSize: ReaderImageViewerNaturalImageSize | null;
  readTransformState: () => ReaderImageViewerTransformState;
  scaleMotionValue: MotionValue<number>;
  setNaturalImageSize: Dispatch<SetStateAction<ReaderImageViewerNaturalImageSize | null>>;
  setTransformState: (nextTransformState: ReaderImageViewerTransformState) => void;
  stopMotionAnimations: () => void;
  surfaceOpacity: MotionValue<number>;
  targetRect: DOMRect;
  translateXMotionValue: MotionValue<number>;
  translateYMotionValue: MotionValue<number>;
}
