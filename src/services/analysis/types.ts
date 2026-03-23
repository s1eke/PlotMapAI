export interface RuntimeAnalysisConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
  contextSize: number;
}

export interface PromptChapter {
  chapterIndex: number;
  title: string;
  content: string;
}

export interface ChunkPromptChapter extends PromptChapter {
  text: string;
  length: number;
}

export interface AnalysisChunkPayload {
  chunkIndex: number;
  chapterIndices: number[];
  startChapterIndex: number;
  endChapterIndex: number;
  contentLength: number;
  chapters: ChunkPromptChapter[];
  text: string;
}

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

export interface AnalysisChapterResult {
  chapterIndex: number;
  title: string;
  summary: string;
  keyPoints: string[];
  tags: string[];
  characters: AnalysisCharacter[];
  relationships: AnalysisRelationship[];
}

export interface ChunkAnalysisResult {
  chunkSummary: string;
  chapterAnalyses: AnalysisChapterResult[];
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

export interface OverviewAnalysisResult {
  bookIntro: string;
  globalSummary: string;
  themes: string[];
  characterStats: OverviewCharacterStat[];
  relationshipGraph: OverviewRelationship[];
  totalChapters: number;
  analyzedChapters: number;
}

export interface SerializedOverview extends OverviewAnalysisResult {
  updatedAt?: string | null;
}

export interface SerializedChapterAnalysis {
  chapterIndex: number;
  chapterTitle: string;
  summary: string;
  keyPoints: string[];
  characters: AnalysisCharacter[];
  relationships: AnalysisRelationship[];
  tags: string[];
  chunkIndex: number;
  updatedAt?: string | null;
}

export interface AggregatedChapterPayload {
  chapterIndex: number;
  chapterTitle: string;
  summary: string;
  keyPoints: string[];
  tags: string[];
  characters: AnalysisCharacter[];
  relationships: AnalysisRelationship[];
}

export interface AggregatedCharacterStat {
  name: string;
  role: string;
  description: string;
  descriptionFragments: string[];
  weight: number;
  sharePercent: number;
  chapters: number[];
  chapterCount: number;
}

export interface AggregatedRelationshipGraphEdge {
  source: string;
  target: string;
  type: string;
  relationTags: string[];
  weight: number;
  mentionCount: number;
  chapterCount: number;
  chapters: number[];
  description: string;
  descriptionFragments: string[];
}

export interface AnalysisAggregates {
  chapters: AggregatedChapterPayload[];
  themes: string[];
  characterStats: AggregatedCharacterStat[];
  allCharacterStats: AggregatedCharacterStat[];
  relationshipGraph: AggregatedRelationshipGraphEdge[];
  allRelationshipGraph: AggregatedRelationshipGraphEdge[];
  analyzedChapters: number;
}

export interface CharacterGraphNode {
  id: string;
  name: string;
  role: string;
  description: string;
  weight: number;
  sharePercent: number;
  chapterCount: number;
  chapters: number[];
  isCore: boolean;
}

export interface CharacterGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  relationTags: string[];
  description: string;
  weight: number;
  mentionCount: number;
  chapterCount: number;
  chapters: number[];
}

export interface CharacterGraphPayload {
  nodes: CharacterGraphNode[];
  edges: CharacterGraphEdge[];
  meta: {
    totalChapters: number;
    analyzedChapters: number;
    nodeCount: number;
    edgeCount: number;
    hasOverview: boolean;
    hasData: boolean;
    isComplete: boolean;
    generatedAt?: string | null;
  };
}
