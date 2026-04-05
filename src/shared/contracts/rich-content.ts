export type Mark = 'bold' | 'italic' | 'underline' | 'strike' | 'sup' | 'sub';

export type RichTextAlign = 'left' | 'center' | 'right';

interface RichAnchorTarget {
  anchorId?: string;
}

export interface RichTextInline {
  type: 'text';
  text: string;
  marks?: Mark[];
}

export interface RichLineBreakInline {
  type: 'lineBreak';
}

export interface RichLinkInline {
  type: 'link';
  href: string;
  children: RichInline[];
}

export type RichInline =
  | RichTextInline
  | RichLineBreakInline
  | RichLinkInline;

export interface RichHeadingBlock extends RichAnchorTarget {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: RichInline[];
  align?: RichTextAlign;
}

export interface RichParagraphBlock extends RichAnchorTarget {
  type: 'paragraph';
  children: RichInline[];
  align?: RichTextAlign;
  indent?: number;
}

export interface RichBlockquoteBlock {
  type: 'blockquote';
  children: RichBlock[];
}

export interface RichListBlock {
  type: 'list';
  ordered: boolean;
  items: RichBlock[][];
}

export interface RichImageBlock extends RichAnchorTarget {
  type: 'image';
  key: string;
  alt?: string;
  caption?: RichInline[];
  width?: number;
  height?: number;
  align?: RichTextAlign;
}

export interface RichHorizontalRuleBlock extends RichAnchorTarget {
  type: 'hr';
}

export interface RichPoemBlock extends RichAnchorTarget {
  type: 'poem';
  lines: RichInline[][];
}

export interface RichTableCell {
  children: RichInline[];
}

export interface RichTableBlock extends RichAnchorTarget {
  type: 'table';
  rows: RichTableCell[][];
}

export interface RichUnsupportedBlock {
  type: 'unsupported';
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
