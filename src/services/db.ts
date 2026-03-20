import Dexie, { type EntityTable } from 'dexie';

interface DefaultTocRule {
  name: string;
  rule: string;
  example: string;
  serialNumber: number;
  enable: boolean;
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
  timeoutMs: number;
  createdAt: string;
}

export interface ReadingProgress {
  id: number;
  novelId: number;
  chapterIndex: number;
  scrollPosition: number;
  viewMode: string;
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
  characters: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
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
  characterStats: Array<Record<string, unknown>>;
  relationshipGraph: Array<Record<string, unknown>>;
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

const CURRENT_DB_VERSION = 5;

const CURRENT_SCHEMA = {
  novels: '++id, createdAt',
  chapters: '++id, novelId, [novelId+chapterIndex]',
  tocRules: '++id, serialNumber, enable',
  purificationRules: '++id, order, isEnabled',
  readingProgress: '++id, novelId',
  analysisJobs: '++id, novelId',
  analysisChunks: '++id, novelId, [novelId+chunkIndex]',
  chapterAnalyses: '++id, novelId, [novelId+chapterIndex]',
  analysisOverviews: '++id, novelId',
  coverImages: '++id, novelId',
  chapterImages: '++id, novelId, [novelId+imageKey]',
} as const;

const db = new Dexie('PlotMapAI') as Dexie & {
  novels: EntityTable<Novel, 'id'>;
  chapters: EntityTable<Chapter, 'id'>;
  tocRules: EntityTable<TocRule, 'id'>;
  purificationRules: EntityTable<PurificationRule, 'id'>;
  readingProgress: EntityTable<ReadingProgress, 'id'>;
  analysisJobs: EntityTable<AnalysisJob, 'id'>;
  analysisChunks: EntityTable<AnalysisChunk, 'id'>;
  chapterAnalyses: EntityTable<ChapterAnalysis, 'id'>;
  analysisOverviews: EntityTable<AnalysisOverview, 'id'>;
  coverImages: EntityTable<CoverImage, 'id'>;
  chapterImages: EntityTable<ChapterImage, 'id'>;
};

// Development phase: keep a single declaration for the latest schema instead of
// preserving every intermediate migration step. If we later need production-grade
// upgrade compatibility, reintroduce explicit version history and upgrades here.
db.version(CURRENT_DB_VERSION).stores(CURRENT_SCHEMA);

async function loadDefaultTocRules(): Promise<DefaultTocRule[]> {
  const [{ default: yaml }, { default: defaultTocRulesRaw }] = await Promise.all([
    import('js-yaml'),
    import('./defaultTocRules.yaml?raw'),
  ]);
  return yaml.load(defaultTocRulesRaw) as DefaultTocRule[];
}

export async function ensureDefaultTocRules(): Promise<void> {
  const count = await db.tocRules.count();
  if (count > 0) return;
  const defaultTocRules = await loadDefaultTocRules();
  const now = new Date().toISOString();
  for (const rule of defaultTocRules) {
    await db.tocRules.add({
      id: undefined as unknown as number,
      name: rule.name,
      rule: rule.rule,
      example: rule.example,
      serialNumber: rule.serialNumber,
      enable: rule.enable,
      isDefault: true,
      createdAt: now,
    });
  }
}

export { db };
