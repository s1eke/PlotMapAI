export interface ChapterBlockSource {
  content: string;
  index: number;
  title: string;
}

export interface ChapterTextSegment {
  type: 'image' | 'text';
  value: string;
}

interface BaseChapterBlockSequenceEntry {
  blockIndex: number;
  chapterIndex: number;
  paragraphIndex: number;
}

export interface BlankChapterBlockSequenceEntry extends BaseChapterBlockSequenceEntry {
  kind: 'blank';
}

export interface ImageChapterBlockSequenceEntry extends BaseChapterBlockSequenceEntry {
  hasParagraphSpacingAfter: boolean;
  imageKey: string;
  kind: 'image';
}

export interface TextChapterBlockSequenceEntry extends BaseChapterBlockSequenceEntry {
  hasParagraphSpacingAfter: boolean;
  kind: 'text';
  text: string;
}

export type ChapterBlockSequenceEntry =
  | BlankChapterBlockSequenceEntry
  | ImageChapterBlockSequenceEntry
  | TextChapterBlockSequenceEntry;

const IMAGE_PATTERN = /\[IMG:([^\]]+)\]/g;

export function parseParagraphSegments(text: string): ChapterTextSegment[] {
  const segments: ChapterTextSegment[] = [];
  let lastIndex = 0;

  IMAGE_PATTERN.lastIndex = 0;
  let match = IMAGE_PATTERN.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, match.index),
      });
    }

    segments.push({
      type: 'image',
      value: match[1],
    });
    lastIndex = match.index + match[0].length;
    match = IMAGE_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      value: text.slice(lastIndex),
    });
  }

  return segments.length > 0
    ? segments
    : [{ type: 'text', value: text }];
}

export function buildChapterBlockSequence(
  chapter: ChapterBlockSource,
): ChapterBlockSequenceEntry[] {
  const lines = chapter.content.split('\n');
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  // 旧版本的导入可能在 chapter.content 的开头仍包含重复的标题。
  const skipLineIndex =
    firstNonEmptyIndex !== -1 && lines[firstNonEmptyIndex].trim() === chapter.title.trim()
      ? firstNonEmptyIndex
      : -1;
  let nextBlockIndex = 1;
  const blocks: ChapterBlockSequenceEntry[] = [];

  const hasLaterNonEmptyLine = (startIndex: number): boolean => {
    for (let index = startIndex; index < lines.length; index += 1) {
      if (index === skipLineIndex) {
        continue;
      }

      if (lines[index]?.trim()) {
        return true;
      }
    }

    return false;
  };

  lines.forEach((line, paragraphIndex) => {
    if (paragraphIndex === skipLineIndex) {
      return;
    }

    if (!line.trim()) {
      const previousLine = paragraphIndex > 0 ? lines[paragraphIndex - 1] : '';
      if (!previousLine?.trim() || !hasLaterNonEmptyLine(paragraphIndex + 1)) {
        return;
      }

      blocks.push({
        blockIndex: nextBlockIndex,
        chapterIndex: chapter.index,
        kind: 'blank',
        paragraphIndex,
      });
      nextBlockIndex += 1;
      return;
    }

    const segments = parseParagraphSegments(line)
      .filter((segment) => segment.type === 'image' || segment.value.trim().length > 0);
    if (segments.length === 0) {
      return;
    }

    const hasImmediateBlankAfter =
      paragraphIndex < lines.length - 1 && !lines[paragraphIndex + 1]?.trim();

    segments.forEach((segment, segmentIndex) => {
      const hasParagraphSpacingAfter =
        segmentIndex === segments.length - 1 && !hasImmediateBlankAfter;
      if (segment.type === 'image') {
        blocks.push({
          blockIndex: nextBlockIndex,
          chapterIndex: chapter.index,
          hasParagraphSpacingAfter,
          imageKey: segment.value,
          kind: 'image',
          paragraphIndex,
        });
        nextBlockIndex += 1;
        return;
      }

      blocks.push({
        blockIndex: nextBlockIndex,
        chapterIndex: chapter.index,
        hasParagraphSpacingAfter,
        kind: 'text',
        paragraphIndex,
        text: segment.value,
      });
      nextBlockIndex += 1;
    });
  });

  return blocks;
}
