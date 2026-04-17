interface ChapterTextContentSource {
  content: string;
  title: string;
}

function normalizeInlineText(value: string): string {
  return value
    .replace(/[^\S\n]+/gu, ' ')
    .trim();
}

export function stripLeadingChapterTitle(content: string, title: string): string {
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    return '';
  }

  const normalizedTitle = normalizeInlineText(title);
  if (normalizedTitle.length === 0) {
    return trimmedContent;
  }

  const lines = trimmedContent.split('\n');
  let cursor = 0;
  let strippedAnyTitle = false;

  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor]?.trim().length === 0) {
      cursor += 1;
    }

    if (cursor >= lines.length) {
      return '';
    }

    if (normalizeInlineText(lines[cursor] ?? '') !== normalizedTitle) {
      break;
    }

    strippedAnyTitle = true;
    cursor += 1;
  }

  if (!strippedAnyTitle) {
    return trimmedContent;
  }

  return lines.slice(cursor).join('\n').trim();
}

export function normalizeImportedChapter<T extends ChapterTextContentSource>(chapter: T): T {
  const normalizedContent = stripLeadingChapterTitle(chapter.content, chapter.title);
  if (normalizedContent === chapter.content) {
    return chapter;
  }

  return {
    ...chapter,
    content: normalizedContent,
  };
}

export function normalizeImportedChapters<T extends ChapterTextContentSource>(chapters: T[]): T[] {
  return chapters.map((chapter) => normalizeImportedChapter(chapter));
}
