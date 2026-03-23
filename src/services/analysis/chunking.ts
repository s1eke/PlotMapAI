import { MIN_CONTEXT_SIZE, PROMPT_RESERVE_BUDGET } from './constants';
import { ChunkingError } from './errors';
import type { AnalysisChunkPayload, ChunkPromptChapter, PromptChapter } from './types';
import { estimatePromptBudget } from './text';

export function buildAnalysisChunks(
  chapters: PromptChapter[],
  contextSize: number,
): AnalysisChunkPayload[] {
  if (contextSize < MIN_CONTEXT_SIZE) {
    throw new ChunkingError(`上下文大小过小，至少需要 ${MIN_CONTEXT_SIZE}。`);
  }
  const contentBudget = contextSize - PROMPT_RESERVE_BUDGET;
  if (contentBudget <= 0) {
    throw new ChunkingError('上下文大小不足以容纳分析提示词，请增大上下文大小。');
  }

  const chunks: AnalysisChunkPayload[] = [];
  const currentChapters: ChunkPromptChapter[] = [];
  let currentLength = 0;

  for (const chapter of chapters) {
    const chapterPayload = buildChunkChapter(chapter);
    if (chapterPayload.length > contentBudget) {
      throw new ChunkingError(
        `第 ${chapter.chapterIndex + 1} 章《${chapter.title || '未命名章节'}》长度超过当前上下文预算，请增大上下文大小后重试。`,
      );
    }
    if (currentChapters.length > 0 && currentLength + chapterPayload.length > contentBudget) {
      chunks.push(buildChunkPayload(chunks.length, currentChapters, currentLength));
      currentChapters.length = 0;
      currentLength = 0;
    }
    currentChapters.push(chapterPayload);
    currentLength += chapterPayload.length;
  }

  if (currentChapters.length > 0) {
    chunks.push(buildChunkPayload(chunks.length, currentChapters, currentLength));
  }

  return chunks;
}

export function buildChunkFromChapters(
  chunkIndex: number,
  chapters: PromptChapter[],
): AnalysisChunkPayload {
  const chunkChapters = chapters.map(buildChunkChapter);
  const contentLength = chunkChapters.reduce((sum, chapter) => sum + chapter.length, 0);
  return buildChunkPayload(chunkIndex, chunkChapters, contentLength);
}

export function renderChapterForPrompt(chapter: PromptChapter): string {
  return `[章节索引]${chapter.chapterIndex}\n[章节标题]${chapter.title || '未命名章节'}\n[章节正文]\n${chapter.content || ''}`;
}

function buildChunkChapter(chapter: PromptChapter): ChunkPromptChapter {
  const text = renderChapterForPrompt(chapter);
  return {
    chapterIndex: chapter.chapterIndex,
    title: chapter.title,
    content: chapter.content,
    text,
    length: estimatePromptBudget(text),
  };
}

function buildChunkPayload(
  chunkIndex: number,
  chapters: ChunkPromptChapter[],
  contentLength: number,
): AnalysisChunkPayload {
  return {
    chunkIndex,
    chapterIndices: chapters.map(chapter => chapter.chapterIndex),
    startChapterIndex: chapters[0].chapterIndex,
    endChapterIndex: chapters[chapters.length - 1].chapterIndex,
    contentLength,
    chapters,
    text: chapters.map(chapter => chapter.text).join('\n\n'),
  };
}
