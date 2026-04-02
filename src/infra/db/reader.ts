import type { EntityTable } from 'dexie';

export interface ReaderLocatorRecord {
  chapterIndex: number;
  blockIndex: number;
  kind: 'heading' | 'text' | 'image';
  lineIndex?: number;
  startCursor?: {
    segmentIndex: number;
    graphemeIndex: number;
  };
  endCursor?: {
    segmentIndex: number;
    graphemeIndex: number;
  };
  edge?: 'start' | 'end';
}

export interface ReaderLayoutCursorRecord {
  segmentIndex: number;
  graphemeIndex: number;
}

export interface ReaderLayoutSignatureRecord {
  textWidth: number;
  pageHeight: number;
  columnCount: number;
  columnGap: number;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

export interface ReaderRenderQueryManifestRecord {
  blockCount?: number;
  lineCount?: number;
  pageCount?: number;
  totalHeight?: number;
  startLocator?: ReaderLocatorRecord | null;
  endLocator?: ReaderLocatorRecord | null;
}

export interface StaticTextLineRecord {
  lineIndex: number;
  text: string;
  width: number;
  start?: ReaderLayoutCursorRecord;
  end?: ReaderLayoutCursorRecord;
}

export interface StaticReaderBlockRecord {
  chapterIndex: number;
  blockIndex: number;
  key: string;
  kind: 'heading' | 'text' | 'image' | 'blank';
  text?: string;
  imageKey?: string;
  marginBefore: number;
  marginAfter: number;
  paragraphIndex: number;
}

export interface StaticScrollBlockRecord {
  block: StaticReaderBlockRecord;
  contentHeight: number;
  displayHeight?: number;
  displayWidth?: number;
  font: string;
  fontSizePx: number;
  fontWeight: number;
  height: number;
  lineHeightPx: number;
  lines: StaticTextLineRecord[];
  marginAfter: number;
  marginBefore: number;
  top: number;
}

export interface StaticScrollChapterTreeRecord {
  chapterIndex: number;
  blockCount: number;
  totalHeight: number;
  textWidth: number;
  metrics: StaticScrollBlockRecord[];
}

export interface StaticTextPageItemRecord {
  chapterIndex: number;
  blockIndex: number;
  contentHeight: number;
  font: string;
  fontSizePx: number;
  height: number;
  key: string;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lineStartIndex: number;
  lines: StaticTextLineRecord[];
  marginAfter: number;
  marginBefore: number;
}

export interface StaticImagePageItemRecord {
  chapterIndex: number;
  blockIndex: number;
  displayHeight: number;
  displayWidth: number;
  edge: 'start' | 'end';
  height: number;
  imageKey: string;
  key: string;
  kind: 'image';
  marginAfter: number;
  marginBefore: number;
}

export interface StaticBlankPageItemRecord {
  chapterIndex: number;
  blockIndex: number;
  height: number;
  key: string;
  kind: 'blank';
}

export interface StaticPageColumnRecord {
  height: number;
  items: Array<StaticTextPageItemRecord | StaticImagePageItemRecord | StaticBlankPageItemRecord>;
}

export interface StaticPageSliceRecord {
  pageIndex: number;
  columnCount: number;
  columns: StaticPageColumnRecord[];
  startLocator: ReaderLocatorRecord | null;
  endLocator: ReaderLocatorRecord | null;
}

export interface StaticPagedChapterTreeRecord {
  chapterIndex: number;
  columnCount: number;
  columnGap: number;
  columnWidth: number;
  pageHeight: number;
  pageSlices: StaticPageSliceRecord[];
}

export interface StaticSummaryShellTreeRecord {
  chapterIndex: number;
  title: string;
  variant: 'summary-shell';
}

export type ReaderRenderTreeRecord =
  | StaticScrollChapterTreeRecord
  | StaticPagedChapterTreeRecord
  | StaticSummaryShellTreeRecord;

export interface ReadingProgressRecord {
  id: number;
  novelId: number;
  chapterIndex: number;
  mode: string;
  chapterProgress?: number;
  locator?: ReaderLocatorRecord;
  updatedAt: string;
}

export interface ReaderRenderCacheRecord {
  id: number;
  novelId: number;
  chapterIndex: number;
  variantFamily: 'original-scroll' | 'original-paged' | 'summary-shell';
  storageKind?: 'render-tree' | 'manifest';
  layoutKey: string;
  layoutSignature: ReaderLayoutSignatureRecord;
  contentHash: string;
  tree?: ReaderRenderTreeRecord | null;
  queryManifest: ReaderRenderQueryManifestRecord;
  updatedAt: string;
  expiresAt: string;
}

export const READER_DB_SCHEMA = {
  readingProgress: '++id, novelId',
  readerRenderCache:
    '++id, [novelId+chapterIndex+variantFamily], [novelId+variantFamily], updatedAt, expiresAt',
} as const;

export interface ReaderTables {
  readingProgress: EntityTable<ReadingProgressRecord, 'id'>;
  readerRenderCache: EntityTable<ReaderRenderCacheRecord, 'id'>;
}
