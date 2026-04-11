import type {
  Mark,
  PaginationBlock,
  PaginationContainer,
  RichBlock,
} from '@shared/contracts';

import type {
  ReaderContentMeasuredToken,
  ReaderContentVisualToken,
} from './readerContentTokens';

export type ReaderContentMode = 'scroll' | 'paged';

export type ReaderContentLeafVariant =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'table'
  | 'hr'
  | 'unsupported';

export type ReaderContentContextVariant =
  | 'body'
  | 'blockquote'
  | 'list-item'
  | 'poem-line'
  | 'table-cell';

export type ReaderContentInlineVariant = 'text' | 'lineBreak' | 'link' | Mark;

export const READER_CONTENT_CLASS_NAMES = {
  root: 'pm-reader',
  chapter: 'pm-reader__chapter',
  chapterHeader: 'pm-reader__chapter-header',
  content: 'pm-reader__content',
  block: 'pm-reader-block',
  blockHeading: 'pm-reader-block--heading',
  blockParagraph: 'pm-reader-block--paragraph',
  blockImage: 'pm-reader-block--image',
  blockTable: 'pm-reader-block--table',
  blockHr: 'pm-reader-block--hr',
  blockUnsupported: 'pm-reader-block--unsupported',
  blockquote: 'pm-reader-block--blockquote',
  listItem: 'pm-reader-block--list-item',
  poemLine: 'pm-reader-block--poem-line',
  inlineLink: 'pm-reader-inline-link',
  listMarker: 'pm-reader-list-marker',
  imageCaption: 'pm-reader-image-caption',
  tableCell: 'pm-reader-table-cell',
} as const;

export const READER_CONTENT_MODE_CLASSES = {
  scroll: 'pm-reader--scroll',
  paged: 'pm-reader--paged',
} as const satisfies Record<ReaderContentMode, string>;

export const READER_CONTENT_THEME_CLASSES = {
  auto: 'pm-reader--theme-auto',
  paper: 'pm-reader--theme-paper',
  parchment: 'pm-reader--theme-parchment',
  green: 'pm-reader--theme-green',
  night: 'pm-reader--theme-night',
} as const;

export interface ReaderContentSourceStructureSpec {
  emittedContexts: readonly ReaderContentContextVariant[];
  emittedLeafVariants: readonly ReaderContentLeafVariant[];
  sourceBlockType: RichBlock['type'];
}

export interface ReaderContentLeafSpec {
  classNames: readonly string[];
  leafVariant: ReaderContentLeafVariant;
  measuredTokens: readonly ReaderContentMeasuredToken[];
  paginationBlockTypes: ReadonlyArray<PaginationBlock['type']>;
  supportsAlignment: boolean;
  supportsCaption: boolean;
  tone: 'primary' | 'muted';
  visualTokens: readonly ReaderContentVisualToken[];
}

export interface ReaderContentContextSpec {
  classNames: readonly string[];
  containers: readonly PaginationContainer[];
  contextVariant: ReaderContentContextVariant;
  helperClassNames: readonly string[];
  measuredTokens: readonly ReaderContentMeasuredToken[];
  visualTokens: readonly ReaderContentVisualToken[];
}

export interface ReaderContentInlineSpec {
  classNames: readonly string[];
  inlineVariant: ReaderContentInlineVariant;
  tagName: 'a' | 'br' | 'em' | 's' | 'span' | 'strong' | 'sub' | 'sup' | 'u';
  visualTokens: readonly ReaderContentVisualToken[];
}

export const READER_CONTENT_SOURCE_STRUCTURE_SPECS = [
  {
    sourceBlockType: 'heading',
    emittedLeafVariants: ['heading'],
    emittedContexts: [],
  },
  {
    sourceBlockType: 'paragraph',
    emittedLeafVariants: ['paragraph'],
    emittedContexts: [],
  },
  {
    sourceBlockType: 'blockquote',
    emittedLeafVariants: ['heading', 'paragraph', 'image', 'table', 'hr', 'unsupported'],
    emittedContexts: ['blockquote'],
  },
  {
    sourceBlockType: 'list',
    emittedLeafVariants: ['heading', 'paragraph', 'image', 'table', 'hr', 'unsupported'],
    emittedContexts: ['list-item'],
  },
  {
    sourceBlockType: 'image',
    emittedLeafVariants: ['image'],
    emittedContexts: [],
  },
  {
    sourceBlockType: 'hr',
    emittedLeafVariants: ['hr'],
    emittedContexts: [],
  },
  {
    sourceBlockType: 'poem',
    emittedLeafVariants: ['paragraph'],
    emittedContexts: ['poem-line'],
  },
  {
    sourceBlockType: 'table',
    emittedLeafVariants: ['table'],
    emittedContexts: ['table-cell'],
  },
  {
    sourceBlockType: 'unsupported',
    emittedLeafVariants: ['unsupported'],
    emittedContexts: [],
  },
] as const satisfies readonly ReaderContentSourceStructureSpec[];

export const READER_CONTENT_LEAF_SPECS = [
  {
    leafVariant: 'heading',
    paginationBlockTypes: ['heading'],
    classNames: [
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockHeading,
    ],
    measuredTokens: [
      '--pm-reader-heading-font-size',
      '--pm-reader-heading-line-height',
      '--pm-reader-heading-margin-top',
      '--pm-reader-heading-margin-bottom',
    ],
    visualTokens: ['--pm-reader-text'],
    supportsAlignment: true,
    supportsCaption: false,
    tone: 'primary',
  },
  {
    leafVariant: 'paragraph',
    paginationBlockTypes: ['paragraph'],
    classNames: [
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockParagraph,
    ],
    measuredTokens: [
      '--pm-reader-font-size',
      '--pm-reader-line-height',
      '--pm-reader-paragraph-gap',
    ],
    visualTokens: ['--pm-reader-text'],
    supportsAlignment: true,
    supportsCaption: false,
    tone: 'primary',
  },
  {
    leafVariant: 'image',
    paginationBlockTypes: ['image'],
    classNames: [
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockImage,
    ],
    measuredTokens: [
      '--pm-reader-image-block-margin-before',
      '--pm-reader-image-block-margin-after',
      '--pm-reader-image-caption-gap',
    ],
    visualTokens: [
      '--pm-reader-text',
      '--pm-reader-text-muted',
      '--pm-reader-image-radius',
      '--pm-reader-shadow-soft',
      '--pm-reader-focus-ring',
    ],
    supportsAlignment: true,
    supportsCaption: true,
    tone: 'primary',
  },
  {
    leafVariant: 'table',
    paginationBlockTypes: ['table'],
    classNames: [
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockTable,
    ],
    measuredTokens: [
      '--pm-reader-table-margin-before',
      '--pm-reader-table-margin-after',
      '--pm-reader-table-cell-padding-x',
      '--pm-reader-table-cell-padding-y',
    ],
    visualTokens: [
      '--pm-reader-surface',
      '--pm-reader-border',
      '--pm-reader-text',
    ],
    supportsAlignment: false,
    supportsCaption: false,
    tone: 'primary',
  },
  {
    leafVariant: 'hr',
    paginationBlockTypes: ['hr'],
    classNames: [
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockHr,
    ],
    measuredTokens: [
      '--pm-reader-hr-height',
      '--pm-reader-hr-margin-before',
      '--pm-reader-hr-margin-after',
    ],
    visualTokens: ['--pm-reader-border'],
    supportsAlignment: false,
    supportsCaption: false,
    tone: 'muted',
  },
  {
    leafVariant: 'unsupported',
    paginationBlockTypes: ['unsupported'],
    classNames: [
      READER_CONTENT_CLASS_NAMES.block,
      READER_CONTENT_CLASS_NAMES.blockUnsupported,
    ],
    measuredTokens: [
      '--pm-reader-font-size',
      '--pm-reader-line-height',
      '--pm-reader-paragraph-gap',
    ],
    visualTokens: ['--pm-reader-text-muted'],
    supportsAlignment: false,
    supportsCaption: false,
    tone: 'muted',
  },
] as const satisfies readonly ReaderContentLeafSpec[];

export const READER_CONTENT_CONTEXT_SPECS = [
  {
    contextVariant: 'body',
    containers: ['body'],
    classNames: [READER_CONTENT_CLASS_NAMES.content],
    helperClassNames: [],
    measuredTokens: [],
    visualTokens: ['--pm-reader-text'],
  },
  {
    contextVariant: 'blockquote',
    containers: ['blockquote'],
    classNames: [READER_CONTENT_CLASS_NAMES.blockquote],
    helperClassNames: [],
    measuredTokens: [
      '--pm-reader-blockquote-border-width',
      '--pm-reader-blockquote-gap',
      '--pm-reader-blockquote-padding',
    ],
    visualTokens: ['--pm-reader-border'],
  },
  {
    contextVariant: 'list-item',
    containers: ['list-item'],
    classNames: [READER_CONTENT_CLASS_NAMES.listItem],
    helperClassNames: [READER_CONTENT_CLASS_NAMES.listMarker],
    measuredTokens: [
      '--pm-reader-list-marker-width',
      '--pm-reader-list-marker-gap',
      '--pm-reader-list-nested-indent',
    ],
    visualTokens: ['--pm-reader-text-muted'],
  },
  {
    contextVariant: 'poem-line',
    containers: ['poem-line'],
    classNames: [READER_CONTENT_CLASS_NAMES.poemLine],
    helperClassNames: [],
    measuredTokens: [
      '--pm-reader-poem-indent',
      '--pm-reader-poem-line-gap',
    ],
    visualTokens: ['--pm-reader-text'],
  },
  {
    contextVariant: 'table-cell',
    containers: ['table-cell'],
    classNames: [READER_CONTENT_CLASS_NAMES.tableCell],
    helperClassNames: [],
    measuredTokens: [
      '--pm-reader-table-cell-padding-x',
      '--pm-reader-table-cell-padding-y',
    ],
    visualTokens: [
      '--pm-reader-border',
      '--pm-reader-text',
    ],
  },
] as const satisfies readonly ReaderContentContextSpec[];

export const READER_CONTENT_INLINE_SPECS = [
  {
    inlineVariant: 'text',
    tagName: 'span',
    classNames: [],
    visualTokens: ['--pm-reader-text'],
  },
  {
    inlineVariant: 'lineBreak',
    tagName: 'br',
    classNames: [],
    visualTokens: [],
  },
  {
    inlineVariant: 'link',
    tagName: 'a',
    classNames: [READER_CONTENT_CLASS_NAMES.inlineLink],
    visualTokens: [
      '--pm-reader-link',
      '--pm-reader-focus-ring',
    ],
  },
  {
    inlineVariant: 'bold',
    tagName: 'strong',
    classNames: [],
    visualTokens: ['--pm-reader-text'],
  },
  {
    inlineVariant: 'italic',
    tagName: 'em',
    classNames: [],
    visualTokens: ['--pm-reader-text'],
  },
  {
    inlineVariant: 'underline',
    tagName: 'u',
    classNames: [],
    visualTokens: ['--pm-reader-text'],
  },
  {
    inlineVariant: 'strike',
    tagName: 's',
    classNames: [],
    visualTokens: ['--pm-reader-text-muted'],
  },
  {
    inlineVariant: 'sup',
    tagName: 'sup',
    classNames: [],
    visualTokens: ['--pm-reader-text'],
  },
  {
    inlineVariant: 'sub',
    tagName: 'sub',
    classNames: [],
    visualTokens: ['--pm-reader-text'],
  },
] as const satisfies readonly ReaderContentInlineSpec[];
