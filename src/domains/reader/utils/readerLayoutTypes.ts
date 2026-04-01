import type { LayoutCursor, LayoutLine } from '@chenglou/pretext';

export const PAGED_VIEWPORT_TOP_PADDING_PX = 16;

export type ReaderRenderVariant = 'original-scroll' | 'original-paged' | 'summary-shell';

export interface ReaderLocator {
  chapterIndex: number;
  blockIndex: number;
  kind: 'heading' | 'text' | 'image';
  lineIndex?: number;
  startCursor?: LayoutCursor;
  endCursor?: LayoutCursor;
  edge?: 'start' | 'end';
}

export interface ReaderBlock {
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

export interface ReaderMeasuredLine extends LayoutLine {
  lineIndex: number;
}

export interface VirtualBlockMetrics {
  block: ReaderBlock;
  contentHeight: number;
  displayHeight?: number;
  displayWidth?: number;
  font: string;
  fontSizePx: number;
  fontWeight: number;
  height: number;
  lineHeightPx: number;
  lines: ReaderMeasuredLine[];
  marginAfter: number;
  marginBefore: number;
  top: number;
}

export interface MeasuredChapterLayout {
  blockCount: number;
  chapterIndex: number;
  metrics: VirtualBlockMetrics[];
  textWidth: number;
  totalHeight: number;
}

export interface ReaderTextPageItem {
  blockIndex: number;
  chapterIndex: number;
  contentHeight: number;
  font: string;
  fontSizePx: number;
  height: number;
  key: string;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lineStartIndex: number;
  lines: ReaderMeasuredLine[];
  marginAfter: number;
  marginBefore: number;
  text: string;
}

export interface ReaderImagePageItem {
  blockIndex: number;
  chapterIndex: number;
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
