import type { RichBlock, RichInline } from '@shared/contracts';

import { buildChapterBlockSequence } from './chapterBlocks';

function normalizePlainText(plainText: string): string {
  return plainText.replace(/\r\n/gu, '\n').trim();
}

function createParagraphChildren(text: string): RichInline[] {
  return text.length > 0
    ? [{
      type: 'text',
      text,
    }]
    : [];
}

export function projectTxtPlainTextToRichBlocks(plainText: string): RichBlock[] {
  const normalizedPlainText = normalizePlainText(plainText);
  if (normalizedPlainText.length === 0) {
    return [];
  }

  return buildChapterBlockSequence({
    content: normalizedPlainText,
    index: 0,
    title: '',
  }).flatMap((block): RichBlock[] => {
    if (block.kind === 'blank') {
      return [];
    }

    if (block.kind === 'image') {
      return [{
        key: block.imageKey,
        type: 'image',
      }];
    }

    return [{
      children: createParagraphChildren(block.text),
      type: 'paragraph',
    }];
  });
}
