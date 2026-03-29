export type ChapterDetectionRuleSource = 'default' | 'custom';

export interface ChapterDetectionRule {
  rule: string;
  source?: ChapterDetectionRuleSource;
}

export interface DetectedChapter {
  title: string;
  start: number;
  end: number;
}

export interface SplitChapter {
  title: string;
  content: string;
}

export interface PurifyRule {
  name?: string;
  group?: string;
  pattern?: string;
  replacement?: string | null;
  is_regex?: boolean;
  is_enabled?: boolean;
  order?: number;
  scope_title?: boolean;
  scope_content?: boolean;
  book_scope?: string;
  exclude_book_scope?: string;
  exclusive_group?: string;
}

export interface PurifiedTitle {
  index: number;
  title: string;
  wordCount: number;
}

export interface PurifiedChapter {
  chapterIndex: number;
  title: string;
  content: string;
  wordCount?: number;
}

export interface ParsedTextDocument {
  title: string;
  chapters: SplitChapter[];
  encoding: string;
  fileHash: string;
  rawText: string;
  totalWords: number;
}
