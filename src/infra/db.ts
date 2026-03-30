import Dexie, { type EntityTable } from 'dexie';

interface ReaderLocatorRecord {
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

interface ReaderLayoutCursorRecord {
  segmentIndex: number;
  graphemeIndex: number;
}

interface ReaderLayoutSignatureRecord {
  textWidth: number;
  pageHeight: number;
  columnCount: number;
  columnGap: number;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
}

interface ReaderRenderQueryManifestRecord {
  blockCount?: number;
  pageCount?: number;
  totalHeight?: number;
  startLocator?: ReaderLocatorRecord | null;
  endLocator?: ReaderLocatorRecord | null;
}

interface StaticTextLineRecord {
  lineIndex: number;
  text: string;
  width: number;
  start?: ReaderLayoutCursorRecord;
  end?: ReaderLayoutCursorRecord;
}

interface StaticReaderBlockRecord {
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

interface StaticScrollBlockRecord {
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

interface StaticScrollChapterTreeRecord {
  chapterIndex: number;
  blockCount: number;
  totalHeight: number;
  textWidth: number;
  metrics: StaticScrollBlockRecord[];
}

interface StaticTextPageItemRecord {
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

interface StaticImagePageItemRecord {
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

interface StaticBlankPageItemRecord {
  chapterIndex: number;
  blockIndex: number;
  height: number;
  key: string;
  kind: 'blank';
}

interface StaticPageColumnRecord {
  height: number;
  items: Array<StaticTextPageItemRecord | StaticImagePageItemRecord | StaticBlankPageItemRecord>;
}

interface StaticPageSliceRecord {
  pageIndex: number;
  columnCount: number;
  columns: StaticPageColumnRecord[];
  startLocator: ReaderLocatorRecord | null;
  endLocator: ReaderLocatorRecord | null;
}

interface StaticPagedChapterTreeRecord {
  chapterIndex: number;
  columnCount: number;
  columnGap: number;
  columnWidth: number;
  pageHeight: number;
  pageSlices: StaticPageSliceRecord[];
}

interface StaticSummaryShellTreeRecord {
  chapterIndex: number;
  title: string;
  variant: 'summary-shell';
}

type ReaderRenderTreeRecord =
  | StaticScrollChapterTreeRecord
  | StaticPagedChapterTreeRecord
  | StaticSummaryShellTreeRecord;

export interface AnalysisCharacter {
  name: string;
  role: string;
  description: string;
  weight: number;
}

export interface AnalysisRelationship {
  source: string;
  target: string;
  type: string;
  description: string;
  weight: number;
}

export interface OverviewCharacterStat {
  name: string;
  role: string;
  description: string;
  weight: number;
  sharePercent: number;
  chapters: number[];
  chapterCount: number;
}

export interface OverviewRelationship {
  source: string;
  target: string;
  type: string;
  relationTags: string[];
  description: string;
  weight?: number;
  mentionCount?: number;
  chapterCount?: number;
  chapters?: number[];
}

export interface Novel {
  id: number;
  title: string;
  author: string;
  description: string;
  tags: string[];
  fileType: string;
  fileHash: string;
  coverPath: string;
  originalFilename: string;
  originalEncoding: string;
  totalWords: number;
  createdAt: string;
}

export interface Chapter {
  id: number;
  novelId: number;
  title: string;
  content: string;
  chapterIndex: number;
  wordCount: number;
}

export interface TocRule {
  id: number;
  name: string;
  rule: string;
  example: string;
  serialNumber: number;
  enable: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface PurificationRule {
  id: number;
  externalId: number | null;
  name: string;
  group: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  isEnabled: boolean;
  order: number;
  scopeTitle: boolean;
  scopeContent: boolean;
  bookScope: string;
  excludeBookScope: string;
  exclusiveGroup: string;
  isDefault: boolean;
  timeoutMs: number;
  createdAt: string;
}

export interface ReadingProgress {
  id: number;
  novelId: number;
  chapterIndex: number;
  scrollPosition: number;
  viewMode: string;
  chapterProgress?: number;
  isTwoColumn?: boolean;
  locatorVersion?: 1;
  locator?: ReaderLocatorRecord;
  updatedAt: string;
}

export interface AppSettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface AnalysisJob {
  id: number;
  novelId: number;
  status: string;
  totalChapters: number;
  analyzedChapters: number;
  totalChunks: number;
  completedChunks: number;
  currentChunkIndex: number;
  pauseRequested: boolean;
  lastError: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeat: string | null;
  updatedAt: string;
}

export interface AnalysisChunk {
  id: number;
  novelId: number;
  chunkIndex: number;
  startChapterIndex: number;
  endChapterIndex: number;
  chapterIndices: number[];
  status: string;
  chunkSummary: string;
  errorMessage: string;
  updatedAt: string;
}

export interface ChapterAnalysis {
  id: number;
  novelId: number;
  chapterIndex: number;
  chapterTitle: string;
  summary: string;
  keyPoints: string[];
  characters: AnalysisCharacter[];
  relationships: AnalysisRelationship[];
  tags: string[];
  chunkIndex: number;
  updatedAt: string;
}

export interface AnalysisOverview {
  id: number;
  novelId: number;
  bookIntro: string;
  globalSummary: string;
  themes: string[];
  characterStats: OverviewCharacterStat[];
  relationshipGraph: OverviewRelationship[];
  totalChapters: number;
  analyzedChapters: number;
  updatedAt: string;
}

export interface CoverImage {
  id: number;
  novelId: number;
  blob: Blob;
}

export interface ChapterImage {
  id: number;
  novelId: number;
  imageKey: string;
  blob: Blob;
}

export interface ReaderRenderCache {
  id: number;
  novelId: number;
  chapterIndex: number;
  variantFamily: 'original-scroll' | 'original-paged' | 'summary-shell';
  layoutKey: string;
  layoutSignature: ReaderLayoutSignatureRecord;
  contentHash: string;
  tree: ReaderRenderTreeRecord;
  queryManifest: ReaderRenderQueryManifestRecord;
  updatedAt: string;
}

const CURRENT_DB_VERSION = 7;

const CURRENT_SCHEMA = {
  novels: '++id, createdAt',
  chapters: '++id, novelId, [novelId+chapterIndex]',
  tocRules: '++id, serialNumber, enable',
  purificationRules: '++id, order, isEnabled',
  readingProgress: '++id, novelId',
  appSettings: 'key, updatedAt',
  analysisJobs: '++id, novelId',
  analysisChunks: '++id, novelId, [novelId+chunkIndex]',
  chapterAnalyses: '++id, novelId, [novelId+chapterIndex]',
  analysisOverviews: '++id, novelId',
  coverImages: '++id, novelId',
  chapterImages: '++id, novelId, [novelId+imageKey]',
  readerRenderCache: '++id, [novelId+chapterIndex+variantFamily], [novelId+variantFamily], updatedAt',
} as const;

const db = new Dexie('PlotMapAI') as Dexie & {
  novels: EntityTable<Novel, 'id'>;
  chapters: EntityTable<Chapter, 'id'>;
  tocRules: EntityTable<TocRule, 'id'>;
  purificationRules: EntityTable<PurificationRule, 'id'>;
  readingProgress: EntityTable<ReadingProgress, 'id'>;
  appSettings: EntityTable<AppSettingRecord, 'key'>;
  analysisJobs: EntityTable<AnalysisJob, 'id'>;
  analysisChunks: EntityTable<AnalysisChunk, 'id'>;
  chapterAnalyses: EntityTable<ChapterAnalysis, 'id'>;
  analysisOverviews: EntityTable<AnalysisOverview, 'id'>;
  coverImages: EntityTable<CoverImage, 'id'>;
  chapterImages: EntityTable<ChapterImage, 'id'>;
  readerRenderCache: EntityTable<ReaderRenderCache, 'id'>;
};

// Development phase: keep a single declaration for the latest schema instead of
// preserving every intermediate migration step. If we later need production-grade
// upgrade compatibility, reintroduce explicit version history and upgrades here.
db.version(CURRENT_DB_VERSION).stores(CURRENT_SCHEMA);

export { db };
