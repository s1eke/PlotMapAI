import type { ChapterContent } from '@shared/contracts/reader';
import type { RichBlock } from '@shared/contracts';
import type { ChapterTextSegment } from '@shared/text-processing/chapterBlocks';

import { parseParagraphSegments } from '@shared/text-processing/chapterBlocks';

const IMG_PATTERN = /\[IMG:([^\]]+)\]/g;

export type { ChapterTextSegment };
export { parseParagraphSegments };

export function extractImageKeysFromText(text: string): string[] {
  const imageKeys = new Set<string>();

  IMG_PATTERN.lastIndex = 0;
  let match = IMG_PATTERN.exec(text);
  while (match !== null) {
    imageKeys.add(match[1]);
    match = IMG_PATTERN.exec(text);
  }

  return Array.from(imageKeys);
}

export function extractImageKeysFromRichBlocks(richBlocks: RichBlock[]): string[] {
  const imageKeys = new Set<string>();

  const visitBlocks = (blocks: RichBlock[]): void => {
    blocks.forEach((block) => {
      if (block.type === 'image') {
        imageKeys.add(block.key);
        return;
      }

      if (block.type === 'blockquote') {
        visitBlocks(block.children);
        return;
      }

      if (block.type === 'list') {
        block.items.forEach((item) => visitBlocks(item));
      }
    });
  };

  visitBlocks(richBlocks);
  return Array.from(imageKeys);
}

export function extractImageKeysFromChapter(
  chapter: Pick<ChapterContent, 'contentFormat' | 'plainText' | 'richBlocks'>,
): string[] {
  if (chapter.contentFormat === 'rich') {
    return extractImageKeysFromRichBlocks(chapter.richBlocks);
  }

  return extractImageKeysFromText(chapter.plainText);
}
