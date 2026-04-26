import type {
  PaginationContainer,
  PaginationListContext,
  ReaderLayoutCursor as SharedReaderLayoutCursor,
  RichBlock,
  RichInline,
  RichTableCell,
  RichTextAlign,
} from '@shared/contracts';

export const PAGED_VIEWPORT_TOP_PADDING_PX = 16;
// 章节标题不来自正文段落；用一个命名哨兵值把这个约定显式化。
export const CHAPTER_TITLE_PARAGRAPH_INDEX = -1;

export type ReaderRenderVariant = 'original-scroll' | 'original-paged' | 'summary-shell';

export type ReaderLayoutCursor = SharedReaderLayoutCursor;

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

export interface ReaderBlock {
  align?: RichTextAlign;
  anchorId?: string;
  blockKey?: string;
  blockTextHash?: string;
  chapterKey?: string;
  contentHash?: string;
  contentVersion?: number;
  chapterIndex: number;
  blockquoteDepth?: number;
  blockIndex: number;
  container?: PaginationContainer;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  imageCaption?: RichInline[];
  key: string;
  kind: 'heading' | 'text' | 'image' | 'blank';
  listContext?: PaginationListContext;
  text?: string;
  imageKey?: string;
  importFormatVersion?: number;
  marginBefore: number;
  marginAfter: number;
  originalTag?: string;
  paragraphIndex: number;
  renderRole?: 'hr' | 'plain' | 'rich-text' | 'table' | 'unsupported';
  richChildren?: RichInline[];
  showListMarker?: boolean;
  sourceBlockType?: RichBlock['type'];
  tableRows?: RichTableCell[][];
  textQuote?: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
  indent?: number;
}

export interface ReaderTypographyMetrics {
  bodyFont: string;
  bodyFontSize: number;
  bodyLineHeightPx: number;
  headingFont: string;
  headingFontSize: number;
  headingLineHeightPx: number;
  paragraphSpacing: number;
}

export interface ReaderLayoutSignature {
  textWidth: number;
  pageHeight: number;
  columnCount: number;
  columnGap: number;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  textLayoutPolicyKey?: string;
  textLayoutPolicyVersion?: number;
  richTextStrategyVersion?: number;
}

export interface ReaderViewportMetrics {
  scrollViewportHeight: number;
  scrollViewportWidth: number;
  scrollTextWidth: number;
  pagedViewportHeight: number;
  pagedViewportWidth: number;
  pagedColumnCount: number;
  pagedColumnWidth: number;
  pagedColumnGap: number;
  pagedFitsTwoColumns: boolean;
}

export interface ReaderImageLayoutConstraints {
  maxImageHeight?: number;
  maxImageWidth?: number;
}

export interface ReaderMeasuredLine {
  end: ReaderLayoutCursor;
  lineIndex: number;
  start: ReaderLayoutCursor;
  text: string;
  width: number;
}

export interface ReaderLineRange {
  end: ReaderLayoutCursor;
  lineIndex: number;
  start: ReaderLayoutCursor;
  width: number;
}

export interface VirtualBlockMetrics {
  block: ReaderBlock;
  captionFont?: string;
  captionFontSizePx?: number;
  captionHeight?: number;
  captionLines?: ReaderMeasuredLine[];
  captionRichLineFragments?: RichInline[][];
  captionLineHeightPx?: number;
  captionSpacing?: number;
  contentHeight: number;
  displayHeight?: number;
  displayWidth?: number;
  font: string;
  fontSizePx: number;
  fontWeight: number;
  height: number;
  lineHeightPx: number;
  lines: ReaderMeasuredLine[];
  lineRanges?: ReaderLineRange[];
  marginAfter: number;
  marginBefore: number;
  richLineFragments?: RichInline[][];
  top: number;
  tableRowHeights?: number[];
}

export interface MeasuredChapterLayout {
  blockCount: number;
  chapterIndex: number;
  metrics: VirtualBlockMetrics[];
  renderMode: 'plain' | 'rich';
  textWidth: number;
  totalHeight: number;
}

export interface ReaderTextPageItem {
  align?: RichTextAlign;
  anchorId?: string;
  blockKey?: string;
  blockTextHash?: string;
  blockquoteDepth?: number;
  blockIndex: number;
  chapterIndex: number;
  chapterKey?: string;
  container?: PaginationContainer;
  contentHeight: number;
  contentHash?: string;
  contentVersion?: number;
  font: string;
  fontSizePx: number;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  height: number;
  indent?: number;
  importFormatVersion?: number;
  key: string;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lineStartIndex: number;
  lines: ReaderMeasuredLine[];
  lineRanges?: ReaderLineRange[];
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
  text: string;
  textQuote?: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
}

export interface ReaderImagePageItem {
  align?: RichTextAlign;
  anchorId?: string;
  blockKey?: string;
  chapterKey?: string;
  blockIndex: number;
  captionFont?: string;
  captionFontSizePx?: number;
  captionHeight?: number;
  captionLineHeightPx?: number;
  captionLines?: ReaderMeasuredLine[];
  captionRichLineFragments?: RichInline[][];
  captionSpacing?: number;
  chapterIndex: number;
  contentHash?: string;
  contentVersion?: number;
  displayHeight: number;
  displayWidth: number;
  edge: 'start' | 'end';
  height: number;
  imageKey: string;
  importFormatVersion?: number;
  key: string;
  kind: 'image';
  marginAfter: number;
  marginBefore: number;
  sourceBlockType?: RichBlock['type'];
}

export interface ReaderBlankPageItem {
  blockIndex: number;
  chapterIndex: number;
  height: number;
  key: string;
  kind: 'blank';
}

export type ReaderPageItem = ReaderTextPageItem | ReaderImagePageItem | ReaderBlankPageItem;

export interface ReaderPageColumn {
  height: number;
  items: ReaderPageItem[];
}

export interface PageSlice {
  columnCount: number;
  columns: ReaderPageColumn[];
  endLocator: ReaderLocator | null;
  pageIndex: number;
  startLocator: ReaderLocator | null;
}

export interface VisibleBlockRange {
  endIndex: number;
  startIndex: number;
}

export interface PaginatedChapterLayout {
  chapterIndex: number;
  columnCount: number;
  columnGap: number;
  columnWidth: number;
  pageHeight: number;
  pageSlices: PageSlice[];
}

export type StaticTextLine = ReaderMeasuredLine;
export type StaticTextLineRange = ReaderLineRange;
export type StaticScrollBlockNode = VirtualBlockMetrics;
export type StaticPagedNode = ReaderPageItem;
export type StaticReaderNode = StaticScrollBlockNode | StaticPagedNode;
export type StaticScrollChapterTree = MeasuredChapterLayout;
export type StaticPagedChapterTree = PaginatedChapterLayout;

export interface StaticSummaryShellTree {
  chapterIndex: number;
  title: string;
  variant: 'summary-shell';
}

export type StaticChapterRenderTree =
  | StaticScrollChapterTree
  | StaticPagedChapterTree
  | StaticSummaryShellTree;

export interface ReaderRenderQueryManifest {
  blockCount?: number;
  lineCount?: number;
  pageCount?: number;
  totalHeight?: number;
  startLocator?: ReaderLocator | null;
  endLocator?: ReaderLocator | null;
}
