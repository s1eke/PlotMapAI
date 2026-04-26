export interface ReaderLayoutCursor {
  segmentIndex: number;
  graphemeIndex: number;
}

export interface ReaderLocator {
  chapterIndex: number;
  chapterKey?: string;
  blockIndex: number;
  blockKey?: string;
  anchorId?: string;
  imageKey?: string;
  kind: 'heading' | 'text' | 'image';
  lineIndex?: number;
  startCursor?: ReaderLayoutCursor;
  endCursor?: ReaderLayoutCursor;
  edge?: 'start' | 'end';
  pageIndex?: number;
  textQuote?: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
  blockTextHash?: string;
  contentVersion?: number;
  importFormatVersion?: number;
  contentHash?: string;
}

export interface ScrollModeAnchor {
  chapterIndex: number;
  chapterProgress: number;
}
