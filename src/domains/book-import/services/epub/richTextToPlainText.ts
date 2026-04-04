import type {
  RichBlock,
  RichInline,
} from '@shared/contracts';

function normalizeInlinePlainText(value: string): string {
  return value
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .trim();
}

function inlineSequenceToPlainText(inlines: RichInline[]): string {
  const value = inlines.reduce((result, inline) => {
    if (inline.type === 'lineBreak') {
      return `${result}\n`;
    }

    if (inline.type === 'link') {
      return `${result}${inlineSequenceToPlainText(inline.children)}`;
    }

    return `${result}${inline.text}`;
  }, '');

  return normalizeInlinePlainText(value);
}

function listItemToPlainText(item: RichBlock[]): string {
  return item
    .map((block) => blockToPlainText(block))
    .filter((text) => text.length > 0)
    .join('\n');
}

function blockToPlainText(block: RichBlock): string {
  if (block.type === 'heading' || block.type === 'paragraph') {
    return inlineSequenceToPlainText(block.children);
  }

  if (block.type === 'blockquote') {
    return blocksToPlainText(block.children);
  }

  if (block.type === 'list') {
    return block.items
      .map((item, index) => {
        const marker = block.ordered ? `${index + 1}. ` : '- ';
        const itemText = listItemToPlainText(item);
        return itemText.length > 0 ? `${marker}${itemText}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (block.type === 'image') {
    const captionText = block.caption ? inlineSequenceToPlainText(block.caption) : '';
    return captionText || '（插图）';
  }

  if (block.type === 'hr') {
    return '';
  }

  if (block.type === 'poem') {
    return block.lines
      .map((line) => inlineSequenceToPlainText(line))
      .filter((line) => line.length > 0)
      .join('\n');
  }

  if (block.type === 'table') {
    return block.rows
      .map((row) => row.map((cell) => inlineSequenceToPlainText(cell.children)).join(' | '))
      .join('\n');
  }

  return block.fallbackText.trim();
}

export function richTextToPlainText(blocks: RichBlock[]): string {
  return blocks
    .map((block) => blockToPlainText(block))
    .filter((text) => text.length > 0)
    .join('\n\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export const blocksToPlainText = richTextToPlainText;
