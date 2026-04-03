import type { RichBlock } from './rich-content';

export type RichContentFormat = 'plain' | 'rich';

export interface ReaderChapterRichContent {
  contentFormat: RichContentFormat;
  richBlocks: RichBlock[];
}

export interface AnalysisTextProjection {
  contentFormat: RichContentFormat;
  plainText: string;
}
