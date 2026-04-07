import type {
  RichBlock,
  RichInline,
  RichLinkInline,
  RichTextInline,
} from '@shared/contracts';

function normalizeTextValue(value: string): string {
  return value.replace(/[^\S\n]+/gu, ' ');
}

function areMarksEqual(left?: readonly string[], right?: readonly string[]): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((mark, index) => mark === right[index]);
}

function trimInlineEdges(inlines: RichInline[]): RichInline[] {
  const trimmed = [...inlines];
  while (trimmed[0]?.type === 'lineBreak') {
    trimmed.shift();
  }
  while (trimmed.at(-1)?.type === 'lineBreak') {
    trimmed.pop();
  }

  if (trimmed[0]?.type === 'text') {
    const firstInline = trimmed[0];
    if (firstInline.type === 'text') {
      trimmed[0] = {
        ...firstInline,
        text: firstInline.text.trimStart(),
      } satisfies RichTextInline;
    }
  }
  if (trimmed.at(-1)?.type === 'text') {
    const lastIndex = trimmed.length - 1;
    const lastInline = trimmed[lastIndex];
    if (lastInline.type === 'text') {
      trimmed[lastIndex] = {
        ...lastInline,
        text: lastInline.text.trimEnd(),
      } satisfies RichTextInline;
    }
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    const current = trimmed[index];
    if (current?.type !== 'lineBreak') {
      continue;
    }

    const previous = trimmed[index - 1];
    if (previous?.type === 'text') {
      trimmed[index - 1] = {
        ...previous,
        text: previous.text.trimEnd(),
      } satisfies RichTextInline;
    }

    const next = trimmed[index + 1];
    if (next?.type === 'text') {
      trimmed[index + 1] = {
        ...next,
        text: next.text.trimStart(),
      } satisfies RichTextInline;
    }
  }

  return trimmed;
}

function normalizeInlineNode(inline: RichInline): RichInline[] {
  if (inline.type === 'lineBreak') {
    return [inline];
  }

  if (inline.type === 'link') {
    const children = normalizeRichInlines(inline.children);
    if (children.length === 0) {
      return [];
    }

    return [{
      ...inline,
      children,
    } satisfies RichLinkInline];
  }

  const normalizedText = normalizeTextValue(inline.text);
  if (normalizedText.trim().length === 0) {
    return [];
  }

  return [{
    ...inline,
    text: normalizedText,
  } satisfies RichTextInline];
}

export function normalizeRichInlines(inlines: RichInline[]): RichInline[] {
  const normalized: RichInline[] = [];
  for (const inline of inlines.flatMap((item) => normalizeInlineNode(item))) {
    const last = normalized.at(-1);
    if (inline.type === 'lineBreak' && last?.type === 'lineBreak') {
      continue;
    }

    if (inline.type === 'text' && last?.type === 'text' && areMarksEqual(last.marks, inline.marks)) {
      normalized[normalized.length - 1] = {
        ...last,
        text: `${last.text}${inline.text}`,
      };
      continue;
    }

    normalized.push(inline);
  }

  return trimInlineEdges(normalized).filter((inline) => inline.type !== 'text' || inline.text.length > 0);
}

function normalizeFallbackText(value: string): string {
  return value
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function normalizeBlock(block: RichBlock): RichBlock | null {
  if (block.type === 'heading' || block.type === 'paragraph') {
    const children = normalizeRichInlines(block.children);
    if (children.length === 0) {
      return null;
    }

    return {
      ...block,
      children,
    };
  }

  if (block.type === 'blockquote') {
    const children = normalizeRichBlocks(block.children);
    if (children.length === 0) {
      return null;
    }

    return {
      ...block,
      children,
    };
  }

  if (block.type === 'list') {
    const items = block.items
      .map((item) => normalizeRichBlocks(item))
      .filter((item) => item.length > 0);

    if (items.length === 0) {
      return null;
    }

    return {
      ...block,
      items,
    };
  }

  if (block.type === 'image') {
    const caption = block.caption ? normalizeRichInlines(block.caption) : undefined;
    return {
      ...block,
      ...(caption && caption.length > 0 ? { caption } : { caption: undefined }),
    };
  }

  if (block.type === 'poem') {
    const lines = block.lines
      .map((line) => normalizeRichInlines(line))
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return null;
    }

    return {
      ...block,
      lines,
    };
  }

  if (block.type === 'table') {
    const rows = block.rows
      .map((row) => row
        .map((cell) => ({
          children: normalizeRichInlines(cell.children),
        })))
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return null;
    }

    return {
      ...block,
      rows,
    };
  }

  if (block.type === 'unsupported') {
    const fallbackText = normalizeFallbackText(block.fallbackText);
    if (fallbackText.length === 0) {
      return null;
    }

    return {
      ...block,
      fallbackText,
    };
  }

  return block;
}

export function normalizeRichBlocks(blocks: RichBlock[]): RichBlock[] {
  return blocks
    .map((block) => normalizeBlock(block))
    .filter((block): block is RichBlock => block !== null);
}
