import type {
  PaginationBlock,
  PaginationContainer,
  PaginationListContext,
  RichBlock,
  RichInline,
} from '@shared/contracts';

export interface RichPaginationBlockSequenceEntry {
  block: PaginationBlock;
  blockIndex: number;
  blockquoteDepth: number;
  chapterIndex: number;
  listContext?: PaginationListContext;
  paragraphIndex: number;
  showListMarker: boolean;
}

interface ProjectionContext {
  blockquoteDepth: number;
  container?: PaginationContainer;
  listContext?: PaginationListContext;
  sourceBlockTypeOverride?: RichBlock['type'];
}

interface SequenceProjectionParams {
  blocks: RichBlock[];
  context: ProjectionContext;
  entries: Array<Omit<RichPaginationBlockSequenceEntry, 'blockIndex'>>;
  paragraphIndexRef: { current: number };
  showListMarkerRef: { current: boolean };
}

function createTextParagraphBlock(params: {
  anchorId?: string;
  children: RichInline[];
  container?: PaginationContainer;
  indent?: number;
  listContext?: PaginationListContext;
  sourceBlockType: RichBlock['type'];
}): PaginationBlock {
  return {
    ...(params.anchorId ? { anchorId: params.anchorId } : {}),
    type: 'paragraph',
    align: undefined,
    children: params.children,
    container: params.container,
    indent: params.indent,
    listContext: params.listContext,
    sourceBlockType: params.sourceBlockType,
  };
}

function inlineChildrenToPlainText(children: RichInline[]): string {
  return children.map((child) => {
    if (child.type === 'text') {
      return child.text;
    }

    if (child.type === 'lineBreak') {
      return '\n';
    }

    return inlineChildrenToPlainText(child.children);
  }).join('');
}

function appendSequenceEntry(params: {
  block: PaginationBlock;
  context: ProjectionContext;
  entries: Array<Omit<RichPaginationBlockSequenceEntry, 'blockIndex'>>;
  paragraphIndexRef: { current: number };
  showListMarkerRef: { current: boolean };
}): void {
  const {
    block,
    context,
    entries,
    paragraphIndexRef,
    showListMarkerRef,
  } = params;

  entries.push({
    block,
    blockquoteDepth: context.blockquoteDepth,
    chapterIndex: 0,
    listContext: context.listContext,
    paragraphIndex: paragraphIndexRef.current,
    showListMarker: showListMarkerRef.current,
  });
  paragraphIndexRef.current += 1;
  showListMarkerRef.current = false;
}

function projectRichBlocksIntoSequence(params: SequenceProjectionParams): void {
  const {
    blocks,
    context,
    entries,
    paragraphIndexRef,
    showListMarkerRef,
  } = params;

  for (const block of blocks) {
    if (block.type === 'blockquote') {
      projectRichBlocksIntoSequence({
        blocks: block.children,
        context: {
          blockquoteDepth: context.blockquoteDepth + 1,
          container: 'blockquote',
          listContext: context.listContext,
          sourceBlockTypeOverride: 'blockquote',
        },
        entries,
        paragraphIndexRef,
        showListMarkerRef,
      });
      continue;
    }

    if (block.type === 'list') {
      const nextDepth = (context.listContext?.depth ?? 0) + 1;

      block.items.forEach((item, itemIndex) => {
        projectRichBlocksIntoSequence({
          blocks: item,
          context: {
            blockquoteDepth: context.blockquoteDepth,
            container: 'list-item',
            listContext: {
              depth: nextDepth,
              itemIndex,
              ordered: block.ordered,
            },
            sourceBlockTypeOverride: 'list',
          },
          entries,
          paragraphIndexRef,
          showListMarkerRef: { current: true },
        });
      });
      continue;
    }

    if (block.type === 'poem') {
      block.lines.forEach((line) => {
        appendSequenceEntry({
          block: createTextParagraphBlock({
            anchorId: block.anchorId,
            children: line,
            container: 'poem-line',
            sourceBlockType: 'poem',
          }),
          context,
          entries,
          paragraphIndexRef,
          showListMarkerRef,
        });
      });
      continue;
    }

    if (block.type === 'table') {
      appendSequenceEntry({
        block: {
          anchorId: block.anchorId,
          type: 'table',
          rows: block.rows,
          sourceBlockType: 'table',
        },
        context,
        entries,
        paragraphIndexRef,
        showListMarkerRef,
      });
      continue;
    }

    if (block.type === 'heading') {
      appendSequenceEntry({
        block: {
          anchorId: block.anchorId,
          type: 'heading',
          align: block.align,
          children: block.children,
          level: block.level,
          sourceBlockType: context.sourceBlockTypeOverride ?? 'heading',
        },
        context,
        entries,
        paragraphIndexRef,
        showListMarkerRef,
      });
      continue;
    }

    if (block.type === 'paragraph') {
      appendSequenceEntry({
        block: {
          anchorId: block.anchorId,
          type: 'paragraph',
          align: block.align,
          children: block.children,
          container: context.container,
          indent: block.indent,
          listContext: context.listContext,
          sourceBlockType: context.sourceBlockTypeOverride ?? 'paragraph',
        },
        context,
        entries,
        paragraphIndexRef,
        showListMarkerRef,
      });
      continue;
    }

    if (block.type === 'image') {
      appendSequenceEntry({
        block: {
          anchorId: block.anchorId,
          type: 'image',
          align: block.align,
          alt: block.alt,
          caption: block.caption,
          container: context.container,
          height: block.height,
          key: block.key,
          sourceBlockType: context.sourceBlockTypeOverride ?? 'image',
          width: block.width,
        },
        context,
        entries,
        paragraphIndexRef,
        showListMarkerRef,
      });
      continue;
    }

    if (block.type === 'hr') {
      appendSequenceEntry({
        block: {
          anchorId: block.anchorId,
          type: 'hr',
          sourceBlockType: context.sourceBlockTypeOverride ?? 'hr',
        },
        context,
        entries,
        paragraphIndexRef,
        showListMarkerRef,
      });
      continue;
    }

    appendSequenceEntry({
      block: {
        type: 'unsupported',
        fallbackText: block.fallbackText,
        originalTag: block.originalTag,
        sourceBlockType: context.sourceBlockTypeOverride ?? 'unsupported',
      },
      context,
      entries,
      paragraphIndexRef,
      showListMarkerRef,
    });
  }
}

export function buildRichPaginationBlockSequence(params: {
  chapterIndex: number;
  richBlocks: RichBlock[];
}): RichPaginationBlockSequenceEntry[] {
  const entries: Array<Omit<RichPaginationBlockSequenceEntry, 'blockIndex'>> = [];
  const paragraphIndexRef = { current: 0 };

  projectRichBlocksIntoSequence({
    blocks: params.richBlocks,
    context: {
      blockquoteDepth: 0,
    },
    entries,
    paragraphIndexRef,
    showListMarkerRef: { current: false },
  });

  return entries.map((entry, index) => ({
    ...entry,
    blockIndex: index + 1,
    chapterIndex: params.chapterIndex,
  }));
}

export function projectRichBlocksToPaginationBlocks(
  richBlocks: RichBlock[],
): PaginationBlock[] {
  return buildRichPaginationBlockSequence({
    chapterIndex: 0,
    richBlocks,
  }).map((entry) => entry.block);
}

export function getPaginationBlockPlainText(block: PaginationBlock): string {
  if (block.type === 'heading' || block.type === 'paragraph') {
    return inlineChildrenToPlainText(block.children);
  }

  if (block.type === 'image') {
    return inlineChildrenToPlainText(block.caption ?? []) || block.alt || '';
  }

  if (block.type === 'table') {
    return block.rows
      .map((row) => row.map((cell) => inlineChildrenToPlainText(cell.children)).join(' | '))
      .join('\n');
  }

  if (block.type === 'unsupported') {
    return block.fallbackText;
  }

  return '';
}

export function getRichInlinePlainText(children: RichInline[]): string {
  return inlineChildrenToPlainText(children);
}
