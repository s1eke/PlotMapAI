import type { EntityTable } from 'dexie';
import type {
  PaginationContainer,
  PaginationListContext,
  RichBlock,
  RichInline,
  RichTableCell,
  RichTextAlign,
} from '@shared/contracts';

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
  pageIndex?: number;
}

export interface CanonicalPositionRecord {
  chapterIndex: number;
  blockIndex?: number;
  kind?: 'heading' | 'text' | 'image';
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

export type ReaderLayoutFeatureSetRecord =
  | 'scroll-plain'
  | 'scroll-rich-inline'
  | 'paged-pagination-block'
  | 'summary-shell';

export interface StaticTextLineRecord {
  lineIndex: number;
  text: string;
  width: number;
  start?: ReaderLayoutCursorRecord;
  end?: ReaderLayoutCursorRecord;
}

export interface StaticReaderBlockRecord {
  align?: RichTextAlign;
  anchorId?: string;
  blockquoteDepth?: number;
  chapterIndex: number;
  blockIndex: number;
  container?: PaginationContainer;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  imageCaption?: RichInline[];
  indent?: number;
  key: string;
  kind: 'heading' | 'text' | 'image' | 'blank';
  listContext?: PaginationListContext;
  originalTag?: string;
  renderRole?: 'hr' | 'plain' | 'rich-text' | 'table' | 'unsupported';
  richChildren?: RichInline[];
  showListMarker?: boolean;
  sourceBlockType?: RichBlock['type'];
  tableRows?: RichTableCell[][];
  text?: string;
  imageKey?: string;
  marginBefore: number;
  marginAfter: number;
  paragraphIndex: number;
}

export interface StaticScrollBlockRecord {
  block: StaticReaderBlockRecord;
  captionRichLineFragments?: RichInline[][];
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
  richLineFragments?: RichInline[][];
  tableRowHeights?: number[];
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
  align?: RichTextAlign;
  anchorId?: string;
  blockquoteDepth?: number;
  chapterIndex: number;
  blockIndex: number;
  container?: PaginationContainer;
  contentHeight: number;
  font: string;
  fontSizePx: number;
  height: number;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  indent?: number;
  key: string;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lineStartIndex: number;
  lines: StaticTextLineRecord[];
  listContext?: PaginationListContext;
  marginAfter: number;
  marginBefore: number;
  originalTag?: string;
  renderRole?: 'hr' | 'plain' | 'rich-text' | 'table' | 'unsupported';
  richLineFragments?: RichInline[][];
  showListMarker?: boolean;
  sourceBlockType?: RichBlock['type'];
  tableRowHeights?: number[];
  tableRows?: RichTableCell[][];
  text?: string;
}

export interface StaticImagePageItemRecord {
  align?: RichTextAlign;
  anchorId?: string;
  captionFont?: string;
  captionFontSizePx?: number;
  captionHeight?: number;
  captionLineHeightPx?: number;
  captionLines?: StaticTextLineRecord[];
  captionRichLineFragments?: RichInline[][];
  captionSpacing?: number;
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
  sourceBlockType?: RichBlock['type'];
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
  canonical?: CanonicalPositionRecord;
  // Legacy mixed-model fields retained only for read/drop compatibility.
  chapterIndex?: number;
  mode?: string;
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
  contentFormat: 'rich';
  contentVersion: number;
  rendererVersion: number;
  layoutFeatureSet: ReaderLayoutFeatureSetRecord;
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
