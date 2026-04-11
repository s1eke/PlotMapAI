import type {
  RichBlock,
  RichInline,
} from '@shared/contracts';

function createPlainTextRichInlines(paragraph: string): RichInline[] {
  const lines = paragraph.split('\n');
  const children: RichInline[] = [];

  lines.forEach((line, index) => {
    if (line.length > 0) {
      children.push({
        type: 'text',
        text: line,
      });
    }

    if (index < lines.length - 1) {
      children.push({ type: 'lineBreak' });
    }
  });

  return children;
}

export function projectPlainTextToRichBlocks(plainText: string): RichBlock[] {
  const normalizedPlainText = plainText.replace(/\r\n/gu, '\n').trim();
  if (normalizedPlainText.length === 0) {
    return [];
  }

  return normalizedPlainText
    .split(/\n\s*\n+/gu)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({
      type: 'paragraph' as const,
      children: createPlainTextRichInlines(paragraph),
    }));
}
