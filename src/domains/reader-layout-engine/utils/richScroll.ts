import type { ChapterContent } from '../readerContentService';
import type {
  ReaderBlock,
} from './readerLayoutTypes';

import {
  buildRichPaginationBlockSequence,
  getPaginationBlockPlainText,
} from '@shared/text-processing';

const BLOCKQUOTE_BORDER_WIDTH_PX = 2;
const BLOCKQUOTE_GAP_PX = 10;
const BLOCKQUOTE_PADDING_PX = 14;
const IMAGE_BLOCK_MARGIN_PX = 16;
const LIST_MARKER_GAP_PX = 8;
const LIST_MARKER_WIDTH_PX = 24;
const LIST_NESTED_INDENT_PX = 20;
const POEM_LINE_GAP_PX = 6;
const POEM_LINE_INDENT_PX = 20;
const RICH_HEADING_BOTTOM_MARGIN_PX = 20;
const RICH_HEADING_TOP_MARGIN_PX = 10;
const RICH_HORIZONTAL_RULE_HEIGHT_PX = 1;
const RICH_HORIZONTAL_RULE_MARGIN_AFTER_PX = 20;
const RICH_HORIZONTAL_RULE_MARGIN_BEFORE_PX = 12;
const RICH_TABLE_MARGIN_AFTER_PX = 16;
const RICH_TABLE_MARGIN_BEFORE_PX = 12;

export interface RichScrollBlockInsets {
  end: number;
  listInset: number;
  markerGap: number;
  markerWidth: number;
  poemInset: number;
  quoteInset: number;
  start: number;
}

function toChapterTitleBlock(chapter: ChapterContent): ReaderBlock {
  return {
    blockIndex: 0,
    chapterIndex: chapter.index,
    headingLevel: 1,
    key: `${chapter.index}:heading:0`,
    kind: 'heading',
    marginAfter: 32,
    marginBefore: 8,
    paragraphIndex: -1,
    text: chapter.title,
  };
}

function createUnsupportedTextChildren(text: string) {
  return text.length > 0
    ? [{
      type: 'text' as const,
      text,
    }]
    : [];
}

export function shouldUseRichScrollBlocks(
  chapter: Pick<ChapterContent, 'contentFormat' | 'richBlocks'>,
  preferRichScrollRendering = true,
): boolean {
  return preferRichScrollRendering
    && chapter.contentFormat === 'rich'
    && chapter.richBlocks.length > 0;
}

export function resolveRichScrollBlockInsets(
  block: Pick<ReaderBlock, 'blockquoteDepth' | 'container' | 'listContext'>,
): RichScrollBlockInsets {
  const quoteInset = Math.max(block.blockquoteDepth ?? 0, 0)
    * (BLOCKQUOTE_BORDER_WIDTH_PX + BLOCKQUOTE_GAP_PX + BLOCKQUOTE_PADDING_PX);
  const listInset = block.listContext
    ? LIST_MARKER_WIDTH_PX
      + LIST_MARKER_GAP_PX
      + Math.max(0, block.listContext.depth - 1) * LIST_NESTED_INDENT_PX
    : 0;
  const poemInset = block.container === 'poem-line' ? POEM_LINE_INDENT_PX : 0;

  return {
    end: quoteInset > 0 ? BLOCKQUOTE_PADDING_PX : 0,
    listInset,
    markerGap: block.listContext ? LIST_MARKER_GAP_PX : 0,
    markerWidth: block.listContext ? LIST_MARKER_WIDTH_PX : 0,
    poemInset,
    quoteInset,
    start: quoteInset + listInset + poemInset,
  };
}

export function formatRichScrollListMarker(
  block: Pick<ReaderBlock, 'listContext'>,
): string | null {
  if (!block.listContext) {
    return null;
  }

  return block.listContext.ordered
    ? `${block.listContext.itemIndex + 1}.`
    : '•';
}

export function buildRichScrollReaderBlocks(
  chapter: ChapterContent,
  paragraphSpacing: number,
): ReaderBlock[] {
  const titleBlock = toChapterTitleBlock(chapter);

  if (!shouldUseRichScrollBlocks(chapter)) {
    return [titleBlock];
  }

  const richSequence = buildRichPaginationBlockSequence({
    chapterIndex: chapter.index,
    richBlocks: chapter.richBlocks,
  });

  const richBlocks = richSequence.map((entry, entryIndex): ReaderBlock => {
    const nextEntry = richSequence[entryIndex + 1] ?? null;
    const sharedFields = {
      align: entry.block.type === 'heading'
        || entry.block.type === 'paragraph'
        || entry.block.type === 'image'
        ? entry.block.align
        : undefined,
      anchorId: 'anchorId' in entry.block ? entry.block.anchorId : undefined,
      blockIndex: entry.blockIndex,
      blockquoteDepth: entry.blockquoteDepth,
      chapterIndex: chapter.index,
      container: entry.block.type === 'paragraph' || entry.block.type === 'image'
        ? entry.block.container
        : undefined,
      key: `${chapter.index}:${entry.block.type}:${entry.blockIndex}`,
      listContext: entry.listContext,
      paragraphIndex: entry.paragraphIndex,
      showListMarker: entry.showListMarker,
      sourceBlockType: entry.block.sourceBlockType,
    } satisfies Partial<ReaderBlock>;

    if (entry.block.type === 'heading') {
      return {
        ...sharedFields,
        headingLevel: entry.block.level,
        key: `${chapter.index}:rich-heading:${entry.blockIndex}`,
        kind: 'heading',
        marginAfter: RICH_HEADING_BOTTOM_MARGIN_PX,
        marginBefore: RICH_HEADING_TOP_MARGIN_PX,
        richChildren: entry.block.children,
        text: getPaginationBlockPlainText(entry.block),
      };
    }

    if (entry.block.type === 'image') {
      return {
        ...sharedFields,
        imageCaption: entry.block.caption,
        imageKey: entry.block.key,
        key: `${chapter.index}:rich-image:${entry.blockIndex}`,
        kind: 'image',
        marginAfter: IMAGE_BLOCK_MARGIN_PX + paragraphSpacing,
        marginBefore: IMAGE_BLOCK_MARGIN_PX,
      };
    }

    if (entry.block.type === 'hr') {
      return {
        ...sharedFields,
        key: `${chapter.index}:rich-hr:${entry.blockIndex}`,
        kind: 'text',
        marginAfter: RICH_HORIZONTAL_RULE_MARGIN_AFTER_PX,
        marginBefore: RICH_HORIZONTAL_RULE_MARGIN_BEFORE_PX,
        renderRole: 'hr',
        text: '',
      };
    }

    if (entry.block.type === 'table') {
      return {
        ...sharedFields,
        key: `${chapter.index}:rich-table:${entry.blockIndex}`,
        kind: 'text',
        marginAfter: RICH_TABLE_MARGIN_AFTER_PX + paragraphSpacing,
        marginBefore: RICH_TABLE_MARGIN_BEFORE_PX,
        renderRole: 'table',
        tableRows: entry.block.rows,
        text: getPaginationBlockPlainText(entry.block),
      };
    }

    const text = entry.block.type === 'unsupported'
      ? entry.block.fallbackText
      : getPaginationBlockPlainText(entry.block);
    const richChildren = entry.block.type === 'paragraph'
      ? entry.block.children
      : createUnsupportedTextChildren(entry.block.fallbackText);
    const isPoemLine = entry.block.type === 'paragraph' && entry.block.container === 'poem-line';
    const nextIsPoemLine = nextEntry?.block.type === 'paragraph'
      && nextEntry.block.container === 'poem-line';

    return {
      ...sharedFields,
      indent: entry.block.type === 'paragraph' ? entry.block.indent : undefined,
      key: `${chapter.index}:rich-text:${entry.blockIndex}`,
      kind: 'text',
      marginAfter: isPoemLine && nextIsPoemLine ? POEM_LINE_GAP_PX : paragraphSpacing,
      marginBefore: 0,
      originalTag: entry.block.type === 'unsupported' ? entry.block.originalTag : undefined,
      renderRole: entry.block.type === 'unsupported' ? 'unsupported' : 'rich-text',
      richChildren,
      text,
    };
  });

  return [titleBlock, ...richBlocks];
}

export function getRichScrollHorizontalTextWidth(
  block: Pick<ReaderBlock, 'blockquoteDepth' | 'container' | 'listContext'>,
  width: number,
): number {
  const insets = resolveRichScrollBlockInsets(block);
  return Math.max(0, width - insets.start - insets.end);
}

export function getRichScrollRuleHeight(): number {
  return RICH_HORIZONTAL_RULE_HEIGHT_PX;
}
