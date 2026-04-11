import type { ChapterContent } from '@shared/contracts/reader';
import type { RichBlock } from '@shared/contracts';

const IMG_PATTERN = /\[IMG:([^\]]+)\]/g;

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
  const richImageKeys = extractImageKeysFromRichBlocks(chapter.richBlocks);
  if (richImageKeys.length > 0) {
    return richImageKeys;
  }

  return extractImageKeysFromText(chapter.plainText);
}
