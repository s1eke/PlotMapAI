import type { ChapterImageGalleryEntry } from '@shared/text-processing';

export interface ReaderImageActivationPayload {
  blockIndex: number;
  chapterIndex: number;
  imageKey: string;
  sourceElement: HTMLElement;
}

export type ReaderImageGalleryEntry = ChapterImageGalleryEntry;

export interface ReaderImageViewerSessionState {
  activeEntry: ReaderImageGalleryEntry | null;
  isIndexLoading: boolean;
  isOpen: boolean;
  originRect: DOMRect | null;
}

export interface ReaderImageViewerTransformState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ReaderImageViewerViewportSize {
  height: number;
  width: number;
}

export interface ReaderImageViewerNaturalImageSize {
  height: number;
  width: number;
}

export interface ReaderImageViewerPoint {
  x: number;
  y: number;
}

export interface ReaderImageViewerSurfaceTransition {
  direction: -1 | 0 | 1;
  kind: 'idle' | 'slide';
  slideOffset: number;
  targetEntryId: string | null;
}
