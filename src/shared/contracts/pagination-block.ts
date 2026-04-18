import type {
  RichBlock,
  RichInline,
} from './rich-content';
import type { RichTextAlign } from './rich-content-capabilities';

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
  anchorId?: string;
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: RichInline[];
  align?: RichTextAlign;
}

export interface PaginationParagraphBlock extends BasePaginationBlock {
  anchorId?: string;
  type: 'paragraph';
  children: RichInline[];
  align?: RichTextAlign;
  indent?: number;
  container?: PaginationContainer;
  listContext?: PaginationListContext;
}

export interface PaginationImageBlock extends BasePaginationBlock {
  anchorId?: string;
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
  anchorId?: string;
  type: 'hr';
}

export interface PaginationTableCell {
  children: RichInline[];
}

export interface PaginationTableBlock extends BasePaginationBlock {
  anchorId?: string;
  type: 'table';
  rows: PaginationTableCell[][];
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
  | PaginationTableBlock
  | PaginationUnsupportedBlock;
