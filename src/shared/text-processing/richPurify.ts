import type { Mark, RichBlock, RichInline } from '@shared/contracts';

import type { PurificationExecutionStage, PurifyRule } from './types';
import { purify } from './purify';

function areMarksEqual(first: Mark[] | undefined, second: Mark[] | undefined): boolean {
  if (!first && !second) {
    return true;
  }

  if (!first || !second || first.length !== second.length) {
    return false;
  }

  return first.every((mark, index) => mark === second[index]);
}

function compactRichInlines(inlines: RichInline[]): RichInline[] {
  const compacted: RichInline[] = [];

  for (const inline of inlines) {
    if (inline.type === 'text') {
      if (inline.text.length === 0) {
        continue;
      }

      const previous = compacted.at(-1);
      if (previous?.type === 'text' && areMarksEqual(previous.marks, inline.marks)) {
        previous.text += inline.text;
        continue;
      }

      compacted.push(inline);
      continue;
    }

    if (inline.type === 'link') {
      if (inline.children.length === 0) {
        continue;
      }
    }

    compacted.push(inline);
  }

  return compacted;
}

function purifyInlineChildren(
  inlines: RichInline[],
  rules: PurifyRule[],
  bookTitle: string,
  target: 'text' | 'heading' | 'caption',
  executionStage: PurificationExecutionStage,
): RichInline[] {
  const nextInlines = inlines.reduce<RichInline[]>((result, inline) => {
    if (inline.type === 'lineBreak') {
      result.push(inline);
      return result;
    }

    if (inline.type === 'link') {
      const children = purifyInlineChildren(
        inline.children,
        rules,
        bookTitle,
        target,
        executionStage,
      );
      if (children.length > 0) {
        result.push({
          ...inline,
          children,
        });
      }

      return result;
    }

    result.push({
      ...inline,
      text: purify(inline.text, rules, target, bookTitle, executionStage),
    });
    return result;
  }, []);

  return compactRichInlines(nextInlines);
}

function hasAnyCellContent(rows: Array<Array<{ children: RichInline[] }>>): boolean {
  return rows.some((row) => row.some((cell) => cell.children.length > 0));
}

function purifyRichBlock(
  block: RichBlock,
  rules: PurifyRule[],
  bookTitle: string,
  executionStage: PurificationExecutionStage,
): RichBlock | null {
  if (block.type === 'heading') {
    const children = purifyInlineChildren(
      block.children,
      rules,
      bookTitle,
      'heading',
      executionStage,
    );
    return children.length > 0 ? { ...block, children } : null;
  }

  if (block.type === 'paragraph') {
    const children = purifyInlineChildren(
      block.children,
      rules,
      bookTitle,
      'text',
      executionStage,
    );
    return children.length > 0 ? { ...block, children } : null;
  }

  if (block.type === 'blockquote') {
    const children = purifyRichBlocks(block.children, rules, bookTitle, executionStage);
    return children.length > 0 ? { ...block, children } : null;
  }

  if (block.type === 'list') {
    const items = block.items
      .map((item) => purifyRichBlocks(item, rules, bookTitle, executionStage))
      .filter((item) => item.length > 0);

    return items.length > 0
      ? {
        ...block,
        items,
      }
      : null;
  }

  if (block.type === 'image') {
    const caption = block.caption
      ? purifyInlineChildren(block.caption, rules, bookTitle, 'caption', executionStage)
      : undefined;

    return {
      ...block,
      ...(caption && caption.length > 0 ? { caption } : { caption: undefined }),
    };
  }

  if (block.type === 'hr') {
    return block;
  }

  if (block.type === 'poem') {
    const lines = block.lines
      .map((line) => purifyInlineChildren(line, rules, bookTitle, 'text', executionStage))
      .filter((line) => line.length > 0);

    return lines.length > 0 ? { ...block, lines } : null;
  }

  if (block.type === 'table') {
    const rows = block.rows
      .map((row) => row.map((cell) => ({
        children: purifyInlineChildren(
          cell.children,
          rules,
          bookTitle,
          'text',
          executionStage,
        ),
      })))
      .filter((row) => row.some((cell) => cell.children.length > 0));

    return hasAnyCellContent(rows)
      ? {
        ...block,
        rows,
      }
      : null;
  }

  const fallbackText = purify(
    block.fallbackText,
    rules,
    'text',
    bookTitle,
    executionStage,
  ).trim();

  return fallbackText.length > 0
    ? {
      ...block,
      fallbackText,
    }
    : null;
}

export function purifyRichBlocks(
  blocks: RichBlock[],
  rules: PurifyRule[],
  bookTitle: string,
  executionStage: PurificationExecutionStage = 'post-ast',
): RichBlock[] {
  return blocks
    .map((block) => purifyRichBlock(block, rules, bookTitle, executionStage))
    .filter((block): block is RichBlock => block !== null);
}
