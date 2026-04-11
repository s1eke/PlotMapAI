import type { ChapterContent } from '@shared/contracts/reader';
import type {
  ReaderBlock,
} from './readerLayoutTypes';

import {
  buildRichPaginationBlockSequence,
  getPaginationBlockPlainText,
} from '@shared/text-processing';
import { READER_CONTENT_TOKEN_DEFAULTS } from '@shared/reader-content';

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
    marginAfter: READER_CONTENT_TOKEN_DEFAULTS.chapterTitleMarginBottomPx,
    marginBefore: READER_CONTENT_TOKEN_DEFAULTS.chapterTitleMarginTopPx,
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
    * (
      READER_CONTENT_TOKEN_DEFAULTS.blockquoteBorderWidthPx
      + READER_CONTENT_TOKEN_DEFAULTS.blockquoteGapPx
      + READER_CONTENT_TOKEN_DEFAULTS.blockquotePaddingPx
    );
  const listInset = block.listContext
    ? READER_CONTENT_TOKEN_DEFAULTS.listMarkerWidthPx
      + READER_CONTENT_TOKEN_DEFAULTS.listMarkerGapPx
      + Math.max(0, block.listContext.depth - 1)
        * READER_CONTENT_TOKEN_DEFAULTS.listNestedIndentPx
    : 0;
  const poemInset = block.container === 'poem-line'
    ? READER_CONTENT_TOKEN_DEFAULTS.poemIndentPx
    : 0;

  return {
    end: quoteInset > 0 ? READER_CONTENT_TOKEN_DEFAULTS.blockquotePaddingPx : 0,
    listInset,
    markerGap: block.listContext ? READER_CONTENT_TOKEN_DEFAULTS.listMarkerGapPx : 0,
    markerWidth: block.listContext ? READER_CONTENT_TOKEN_DEFAULTS.listMarkerWidthPx : 0,
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
        marginAfter: READER_CONTENT_TOKEN_DEFAULTS.headingMarginBottomPx,
        marginBefore: READER_CONTENT_TOKEN_DEFAULTS.headingMarginTopPx,
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
        marginAfter: READER_CONTENT_TOKEN_DEFAULTS.imageBlockMarginPx + paragraphSpacing,
        marginBefore: READER_CONTENT_TOKEN_DEFAULTS.imageBlockMarginPx,
      };
    }

    if (entry.block.type === 'hr') {
      return {
        ...sharedFields,
        key: `${chapter.index}:rich-hr:${entry.blockIndex}`,
        kind: 'text',
        marginAfter: READER_CONTENT_TOKEN_DEFAULTS.hrMarginAfterPx,
        marginBefore: READER_CONTENT_TOKEN_DEFAULTS.hrMarginBeforePx,
        renderRole: 'hr',
        text: '',
      };
    }

    if (entry.block.type === 'table') {
      return {
        ...sharedFields,
        key: `${chapter.index}:rich-table:${entry.blockIndex}`,
        kind: 'text',
        marginAfter: READER_CONTENT_TOKEN_DEFAULTS.tableMarginAfterPx + paragraphSpacing,
        marginBefore: READER_CONTENT_TOKEN_DEFAULTS.tableMarginBeforePx,
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
      marginAfter: isPoemLine && nextIsPoemLine
        ? READER_CONTENT_TOKEN_DEFAULTS.poemLineGapPx
        : paragraphSpacing,
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
  return READER_CONTENT_TOKEN_DEFAULTS.hrHeightPx;
}
