import type {
  RichBlock,
  RichInline,
  RichTextAlign,
} from './rich-content';

export type PaginationContainer =
  | 'body'
  | 'blockquote'
  | 'list-item'
  | 'poem-line'
  | 'table-cell';

export interface PaginationListContext {
  ordered: boolean;
  itemIndex: number;
  depth: number;
}

interface BasePaginationBlock {
  sourceBlockType: RichBlock['type'];
}

export interface PaginationHeadingBlock extends BasePaginationBlock {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: RichInline[];
  align?: RichTextAlign;
}

export interface PaginationParagraphBlock extends BasePaginationBlock {
  type: 'paragraph';
  children: RichInline[];
  align?: RichTextAlign;
  indent?: number;
  container?: PaginationContainer;
  listContext?: PaginationListContext;
}

export interface PaginationImageBlock extends BasePaginationBlock {
  type: 'image';
  key: string;
  alt?: string;
  caption?: RichInline[];
  width?: number;
  height?: number;
  align?: RichTextAlign;
  container?: PaginationContainer;
}

export interface PaginationHorizontalRuleBlock extends BasePaginationBlock {
  type: 'hr';
}

export interface PaginationUnsupportedBlock extends BasePaginationBlock {
  type: 'unsupported';
  fallbackText: string;
  originalTag?: string;
}

export type PaginationBlock =
  | PaginationHeadingBlock
  | PaginationParagraphBlock
  | PaginationImageBlock
  | PaginationHorizontalRuleBlock
  | PaginationUnsupportedBlock;
