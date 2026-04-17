export type ChapterDetectionRuleSource = 'default' | 'custom';

export type PurificationTargetScope = 'text' | 'heading' | 'caption' | 'all';

export type PurificationExecutionStage = 'pre-ast' | 'post-ast' | 'plain-text-only';

export interface ChapterDetectionRule {
  rule: string;
  source?: ChapterDetectionRuleSource;
}

export interface PurifyRule {
  name?: string;
  group?: string;
  pattern?: string;
  replacement?: string | null;
  is_regex?: boolean;
  is_enabled?: boolean;
  order?: number;
  target_scope?: PurificationTargetScope;
  execution_stage?: PurificationExecutionStage;
  rule_version?: number;
  // Legacy YAML compatibility fields.
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
