import type {
  RichBlockType,
  RichInlineType,
  RichMark,
  RichTextAlign,
} from './rich-content-capabilities';

export type Mark = RichMark;
export type { RichBlockType, RichInlineType };

interface RichAnchorTarget {
  anchorId?: string;
}

export interface RichTextInline {
  type: Extract<RichInlineType, 'text'>;
  text: string;
  marks?: Mark[];
}

export interface RichLineBreakInline {
  type: Extract<RichInlineType, 'lineBreak'>;
}

export interface RichLinkInline {
  type: Extract<RichInlineType, 'link'>;
  href: string;
  children: RichInline[];
}

export type RichInline =
  | RichTextInline
  | RichLineBreakInline
  | RichLinkInline;

export interface RichHeadingBlock extends RichAnchorTarget {
  type: Extract<RichBlockType, 'heading'>;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: RichInline[];
  align?: RichTextAlign;
}

export interface RichParagraphBlock extends RichAnchorTarget {
  type: Extract<RichBlockType, 'paragraph'>;
  children: RichInline[];
  align?: RichTextAlign;
  indent?: number;
}

export interface RichBlockquoteBlock {
  type: Extract<RichBlockType, 'blockquote'>;
  children: RichBlock[];
}

export interface RichListBlock {
  type: Extract<RichBlockType, 'list'>;
  ordered: boolean;
  items: RichBlock[][];
}

export interface RichImageBlock extends RichAnchorTarget {
  type: Extract<RichBlockType, 'image'>;
  key: string;
  alt?: string;
  caption?: RichInline[];
  width?: number;
  height?: number;
  align?: RichTextAlign;
}

export interface RichHorizontalRuleBlock extends RichAnchorTarget {
  type: Extract<RichBlockType, 'hr'>;
}

export interface RichPoemBlock extends RichAnchorTarget {
  type: Extract<RichBlockType, 'poem'>;
  lines: RichInline[][];
}

export interface RichTableCell {
  children: RichInline[];
}

export interface RichTableBlock extends RichAnchorTarget {
  type: Extract<RichBlockType, 'table'>;
  rows: RichTableCell[][];
}

export interface RichUnsupportedBlock {
  type: Extract<RichBlockType, 'unsupported'>;
  fallbackText: string;
  originalTag?: string;
}

export type RichBlock =
  | RichHeadingBlock
  | RichParagraphBlock
  | RichBlockquoteBlock
  | RichListBlock
  | RichImageBlock
  | RichHorizontalRuleBlock
  | RichPoemBlock
  | RichTableBlock
  | RichUnsupportedBlock;
