import type { ChapterContent } from '../readerContentService';
import type {
  ReaderLayoutSignature,
  ReaderRenderVariant,
  StaticPagedChapterTree,
} from './readerLayout';
import type {
  ReaderImageDimensions,
} from './readerImageResourceCache';
import type {
  ReaderRenderCacheSource,
  ReaderRenderStorageKind,
} from './readerRenderCache';

import { extractImageKeysFromText } from './chapterImages';
import {
  createChapterContentHash,
  serializeReaderLayoutSignature,
} from './readerLayout';
import { buildReaderRenderCacheKey } from './readerRenderCache';
import { peekReaderImageDimensions } from './readerImageResourceCache';

export interface ReaderVisibleRenderTarget {
  chapter: ChapterContent;
  contentHash: string;
  exactKey: string;
  layoutKey: string;
  variantFamily: ReaderRenderVariant;
}

export interface ReaderRenderPreheatTarget {
  chapterIndex: number;
  storageKind: ReaderRenderStorageKind;
  variantFamily: ReaderRenderVariant;
}

const EMPTY_CACHE_SOURCE_COUNTS: Record<ReaderRenderCacheSource, number> = {
  built: 0,
  dexie: 0,
  memory: 0,
};

const RENDER_VARIANTS: ReaderRenderVariant[] = [
  'original-scroll',
  'original-paged',
  'summary-shell',
];

export function getActiveVariant(
  isPagedMode: boolean,
  viewMode: 'original' | 'summary',
): ReaderRenderVariant {
  if (viewMode === 'summary') {
    return 'summary-shell';
  }

  return isPagedMode ? 'original-paged' : 'original-scroll';
}

export function collectLoadedImageKeys(params: {
  currentChapter: ChapterContent | null;
  pagedChapters: ChapterContent[];
  scrollChapters: Array<{ chapter: ChapterContent; index: number }>;
}): string[] {
  const keys = new Set<string>();

  if (params.currentChapter) {
    for (const imageKey of extractImageKeysFromText(params.currentChapter.content)) {
      keys.add(imageKey);
    }
  }

  for (const chapter of params.pagedChapters) {
    for (const imageKey of extractImageKeysFromText(chapter.content)) {
      keys.add(imageKey);
    }
  }

  for (const renderableChapter of params.scrollChapters) {
    for (const imageKey of extractImageKeysFromText(renderableChapter.chapter.content)) {
      keys.add(imageKey);
    }
  }

  return Array.from(keys.values()).sort();
}

export function buildChapterImageDimensionsMap(
  novelId: number,
  chapter: Pick<ChapterContent, 'content'>,
): Map<string, ReaderImageDimensions | null | undefined> {
  const dimensions = new Map<string, ReaderImageDimensions | null | undefined>();

  for (const imageKey of extractImageKeysFromText(chapter.content)) {
    dimensions.set(imageKey, peekReaderImageDimensions(novelId, imageKey));
  }

  return dimensions;
}

export function buildChapterImageLayoutKey(
  novelId: number,
  chapter: Pick<ChapterContent, 'content'>,
  baseLayoutKey: string,
): string {
  const imageKeys = extractImageKeysFromText(chapter.content);
  if (imageKeys.length === 0) {
    return baseLayoutKey;
  }

  const imageFingerprint = imageKeys
    .map((imageKey) => {
      const dimensions = peekReaderImageDimensions(novelId, imageKey);
      if (dimensions === undefined) {
        return `${imageKey}:pending`;
      }
      if (dimensions === null) {
        return `${imageKey}:missing`;
      }

      return `${imageKey}:${Math.round(dimensions.width)}x${Math.round(dimensions.height)}`;
    })
    .join(',');

  return `${baseLayoutKey}::img:${imageFingerprint}`;
}

export function buildVisibleRenderTargets(params: {
  currentChapter: ChapterContent | null;
  isPagedMode: boolean;
  novelId: number;
  pagedChapters: ChapterContent[];
  scrollChapters: Array<{ chapter: ChapterContent; index: number }>;
  variantSignatures: Record<ReaderRenderVariant, ReaderLayoutSignature>;
  viewMode: 'original' | 'summary';
}): ReaderVisibleRenderTarget[] {
  const targets: ReaderVisibleRenderTarget[] = [];

  if (params.viewMode === 'summary') {
    if (!params.currentChapter) {
      return targets;
    }

    const signature = params.variantSignatures['summary-shell'];
    const contentHash = createChapterContentHash(params.currentChapter);
    const layoutKey = buildChapterImageLayoutKey(
      params.novelId,
      params.currentChapter,
      serializeReaderLayoutSignature(signature),
    );

    targets.push({
      chapter: params.currentChapter,
      contentHash,
      exactKey: buildReaderRenderCacheKey({
        chapterIndex: params.currentChapter.index,
        contentHash,
        layoutKey,
        novelId: params.novelId,
        variantFamily: 'summary-shell',
      }),
      layoutKey,
      variantFamily: 'summary-shell',
    });

    return targets;
  }

  if (params.isPagedMode) {
    const signature = params.variantSignatures['original-paged'];

    for (const chapter of params.pagedChapters) {
      const contentHash = createChapterContentHash(chapter);
      const layoutKey = buildChapterImageLayoutKey(
        params.novelId,
        chapter,
        serializeReaderLayoutSignature(signature),
      );

      targets.push({
        chapter,
        contentHash,
        exactKey: buildReaderRenderCacheKey({
          chapterIndex: chapter.index,
          contentHash,
          layoutKey,
          novelId: params.novelId,
          variantFamily: 'original-paged',
        }),
        layoutKey,
        variantFamily: 'original-paged',
      });
    }

    return targets;
  }

  const signature = params.variantSignatures['original-scroll'];

  for (const renderableChapter of params.scrollChapters) {
    const contentHash = createChapterContentHash(renderableChapter.chapter);
    const layoutKey = buildChapterImageLayoutKey(
      params.novelId,
      renderableChapter.chapter,
      serializeReaderLayoutSignature(signature),
    );

    targets.push({
      chapter: renderableChapter.chapter,
      contentHash,
      exactKey: buildReaderRenderCacheKey({
        chapterIndex: renderableChapter.index,
        contentHash,
        layoutKey,
        novelId: params.novelId,
        variantFamily: 'original-scroll',
      }),
      layoutKey,
      variantFamily: 'original-scroll',
    });
  }

  return targets;
}

export function buildPreheatTargets(params: {
  activeVariant: ReaderRenderVariant;
  chaptersLength: number;
  currentChapterIndex: number | null;
}): ReaderRenderPreheatTarget[] {
  if (params.currentChapterIndex === null || params.chaptersLength === 0) {
    return [];
  }

  const targets: ReaderRenderPreheatTarget[] = [];
  const seen = new Set<string>();

  const pushTarget = (
    chapterIndex: number,
    variantFamily: ReaderRenderVariant,
    storageKind: ReaderRenderStorageKind,
  ) => {
    const key = `${chapterIndex}:${variantFamily}:${storageKind}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    targets.push({ chapterIndex, storageKind, variantFamily });
  };

  for (const variantFamily of RENDER_VARIANTS) {
    if (variantFamily !== params.activeVariant) {
      pushTarget(params.currentChapterIndex, variantFamily, 'render-tree');
    }
  }

  if (params.activeVariant === 'summary-shell') {
    return targets;
  }

  for (let distance = 1; distance < params.chaptersLength; distance += 1) {
    const previousIndex = params.currentChapterIndex - distance;
    const nextIndex = params.currentChapterIndex + distance;

    if (previousIndex >= 0) {
      pushTarget(previousIndex, params.activeVariant, 'manifest');
    }

    if (nextIndex < params.chaptersLength) {
      pushTarget(nextIndex, params.activeVariant, 'manifest');
    }
  }

  return targets;
}

export function summarizeCacheSources(
  sources: Iterable<ReaderRenderCacheSource>,
): Record<ReaderRenderCacheSource, number> {
  const counts = { ...EMPTY_CACHE_SOURCE_COUNTS };

  for (const source of sources) {
    counts[source] += 1;
  }

  return counts;
}

export function countPageItems(tree: StaticPagedChapterTree): number {
  return tree.pageSlices.reduce((pageTotal, page) => (
    pageTotal + page.columns.reduce((columnTotal, column) => columnTotal + column.items.length, 0)
  ), 0);
}

