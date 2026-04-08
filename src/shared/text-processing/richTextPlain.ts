import type { RichBlock, RichInline, RichTableCell } from '@shared/contracts';

function inlineSequenceToPlainText(inlines: RichInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === 'text') {
        return inline.text;
      }

      if (inline.type === 'lineBreak') {
        return '\n';
      }

      return inlineSequenceToPlainText(inline.children);
    })
    .join('');
}

function listItemToPlainText(item: RichBlock[]): string {
  return item
    .map((block) => blockToPlainText(block))
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}

function tableRowToPlainText(row: RichTableCell[]): string {
  const cellTexts = row.map((cell) => inlineSequenceToPlainText(cell.children).trim());
  if (cellTexts.every((cellText) => cellText.length === 0)) {
    return '';
  }

  return cellTexts.join(' | ');
}

function blockToPlainText(block: RichBlock): string {
  if (block.type === 'heading' || block.type === 'paragraph') {
    return inlineSequenceToPlainText(block.children).trim();
  }

  if (block.type === 'blockquote') {
    return block.children
      .map((child) => blockToPlainText(child))
      .filter((text) => text.length > 0)
      .join('\n\n')
      .trim();
  }

  if (block.type === 'list') {
    return block.items
      .map((item, index) => {
        const itemText = listItemToPlainText(item);
        if (!itemText) {
          return '';
        }

        return block.ordered
          ? `${index + 1}. ${itemText}`
          : `- ${itemText}`;
      })
      .filter((text) => text.length > 0)
      .join('\n')
      .trim();
  }

  if (block.type === 'image') {
    const caption = inlineSequenceToPlainText(block.caption ?? []).trim();
    if (caption.length > 0) {
      return caption;
    }

    return block.alt?.trim() || '（插图）';
  }

  if (block.type === 'hr') {
    return '---';
  }

  if (block.type === 'poem') {
    return block.lines
      .map((line) => inlineSequenceToPlainText(line).trimEnd())
      .filter((line) => line.length > 0)
      .join('\n')
      .trim();
  }

  if (block.type === 'table') {
    return block.rows
      .map((row) => tableRowToPlainText(row))
      .filter((rowText) => rowText.length > 0)
      .join('\n')
      .trim();
  }

  return block.fallbackText.trim();
}

export function richTextToPlainText(blocks: RichBlock[]): string {
  return blocks
    .map((block) => blockToPlainText(block))
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
}
