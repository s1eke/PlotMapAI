import type { ReaderLayoutSignature, ReaderLocator } from '../layout/readerLayoutTypes';
import type {
  ChapterFlowManifest,
  ChapterFlowManifestIdentity,
  GlobalPagedPosition,
  GlobalScrollPosition,
  NovelFlowChapterEntry,
  NovelFlowIndex,
} from './novelFlowIndexTypes';

import { areLocatorsEquivalent } from '../locator/readerLocatorHelpers';

export {
  createChapterFlowManifestFromRenderCacheRecord,
  createChapterFlowManifestFromScrollTree,
  mergeChapterFlowManifests,
} from './chapterFlowManifest';
export type {
  ChapterFlowBlockSummary,
  ChapterFlowManifest,
  ChapterFlowManifestIdentity,
  ChapterFlowManifestStatus,
  GlobalPagedPosition,
  GlobalScrollPosition,
  NovelFlowChapterEntry,
  NovelFlowIndex,
} from './novelFlowIndexTypes';

export function buildNovelFlowIndex(params: {
  chapterCount: number;
  layoutKey: string;
  layoutSignature: ReaderLayoutSignature;
  manifests?: Iterable<ChapterFlowManifest | null | undefined>;
  novelId: number;
}): NovelFlowIndex {
  const manifestsByChapter = new Map<number, ChapterFlowManifest>();
  for (const manifest of params.manifests ?? []) {
    if (manifest) {
      manifestsByChapter.set(manifest.chapterIndex, manifest);
    }
  }

  const chapters: NovelFlowChapterEntry[] = [];
  let scrollCursor = 0;
  let pageCursor = 0;

  for (let chapterIndex = 0; chapterIndex < params.chapterCount; chapterIndex += 1) {
    const manifest = manifestsByChapter.get(chapterIndex) ?? null;
    const scrollHeight = manifest ? Math.max(0, manifest.scrollHeight) : 0;
    const pageCount = manifest ? normalizePageCount(manifest.pageCount) : 0;
    const entry: NovelFlowChapterEntry = {
      blockSummaries: manifest?.blockSummaries ?? [],
      chapterIndex,
      chapterKey: manifest?.chapterKey,
      endLocator: manifest?.endLocator ?? null,
      manifestStatus: manifest?.status ?? 'missing',
      pageEnd: pageCursor + pageCount,
      pageStart: pageCursor,
      scrollEnd: scrollCursor + scrollHeight,
      scrollStart: scrollCursor,
      startLocator: manifest?.startLocator ?? null,
    };
    chapters.push(entry);
    scrollCursor = entry.scrollEnd;
    pageCursor = entry.pageEnd;
  }

  return {
    chapters,
    layoutKey: params.layoutKey,
    layoutSignature: params.layoutSignature,
    novelId: params.novelId,
    totalPageCount: pageCursor,
    totalScrollHeight: scrollCursor,
  };
}

export function resolveGlobalOffsetPosition(
  index: NovelFlowIndex,
  globalOffset: number,
): GlobalScrollPosition | null {
  if (index.totalScrollHeight <= 0) {
    return null;
  }

  const clampedOffset = clamp(globalOffset, 0, index.totalScrollHeight);
  const matchedEntry = findEntryForGlobalOffset(index.chapters, clampedOffset);
  if (!matchedEntry) {
    return null;
  }

  const localOffset = clamp(
    clampedOffset - matchedEntry.scrollStart,
    0,
    matchedEntry.scrollEnd - matchedEntry.scrollStart,
  );
  const chapterHeight = matchedEntry.scrollEnd - matchedEntry.scrollStart;

  return {
    chapterIndex: matchedEntry.chapterIndex,
    chapterProgress: chapterHeight > 0 ? localOffset / chapterHeight : 0,
    globalOffset: clampedOffset,
    localOffset,
  };
}

export function toGlobalOffset(
  index: NovelFlowIndex,
  position: { chapterIndex: number; localOffset: number },
): number | null {
  const entry = index.chapters[position.chapterIndex];
  if (!entry || entry.manifestStatus === 'missing') {
    return null;
  }

  const chapterHeight = entry.scrollEnd - entry.scrollStart;
  return entry.scrollStart + clamp(position.localOffset, 0, chapterHeight);
}

export function resolveGlobalPagePosition(
  index: NovelFlowIndex,
  globalPageIndex: number,
): GlobalPagedPosition | null {
  if (index.totalPageCount <= 0) {
    return null;
  }

  const clampedPageIndex = Math.floor(clamp(globalPageIndex, 0, index.totalPageCount - 1));
  const matchedEntry = index.chapters.find((entry) => (
    entry.pageEnd > entry.pageStart
      && clampedPageIndex >= entry.pageStart
      && clampedPageIndex < entry.pageEnd
  ));
  if (!matchedEntry) {
    return null;
  }

  const localPageIndex = clampedPageIndex - matchedEntry.pageStart;
  return {
    chapterIndex: matchedEntry.chapterIndex,
    globalPageIndex: clampedPageIndex,
    localPageIndex,
    locator: localPageIndex === 0 ? matchedEntry.startLocator : null,
  };
}

export function toGlobalPageIndex(
  index: NovelFlowIndex,
  position: { chapterIndex: number; localPageIndex: number },
): number | null {
  const entry = index.chapters[position.chapterIndex];
  if (!entry || entry.manifestStatus === 'missing' || entry.pageEnd <= entry.pageStart) {
    return null;
  }

  const pageCount = entry.pageEnd - entry.pageStart;
  return entry.pageStart + Math.floor(clamp(position.localPageIndex, 0, pageCount - 1));
}

export function resolveLocatorGlobalOffset(
  index: NovelFlowIndex,
  locator: ReaderLocator | null | undefined,
): number | null {
  if (!locator) {
    return null;
  }

  const entry = index.chapters[locator.chapterIndex];
  if (!entry || entry.manifestStatus === 'missing') {
    return null;
  }

  if (areLocatorsEquivalent(entry.startLocator, locator)) {
    return entry.scrollStart;
  }

  if (areLocatorsEquivalent(entry.endLocator, locator)) {
    return entry.scrollEnd;
  }

  const summary = findBlockSummaryForLocator(entry, locator);
  if (!summary) {
    return null;
  }

  const localOffset = locator.edge === 'end'
    ? summary.startOffset + summary.height
    : summary.startOffset;
  return entry.scrollStart + clamp(localOffset, 0, entry.scrollEnd - entry.scrollStart);
}

export function resolveLocatorGlobalPageIndex(
  index: NovelFlowIndex,
  locator: ReaderLocator | null | undefined,
): number | null {
  if (!locator) {
    return null;
  }

  const entry = index.chapters[locator.chapterIndex];
  if (!entry || entry.manifestStatus === 'missing' || entry.pageEnd <= entry.pageStart) {
    return null;
  }

  if (areLocatorsEquivalent(entry.startLocator, locator)) {
    return entry.pageStart;
  }

  if (areLocatorsEquivalent(entry.endLocator, locator)) {
    return entry.pageEnd - 1;
  }

  if (typeof locator.pageIndex === 'number') {
    return toGlobalPageIndex(index, {
      chapterIndex: locator.chapterIndex,
      localPageIndex: locator.pageIndex,
    });
  }

  const summary = findBlockSummaryForLocator(entry, locator);
  if (!summary) {
    return null;
  }

  if (typeof summary.pageStart === 'number') {
    return entry.pageStart + clamp(
      summary.pageStart,
      0,
      Math.max(0, entry.pageEnd - entry.pageStart - 1),
    );
  }

  const chapterHeight = entry.scrollEnd - entry.scrollStart;
  const pageCount = entry.pageEnd - entry.pageStart;
  if (chapterHeight <= 0 || pageCount <= 0) {
    return null;
  }

  const estimatedLocalPage = Math.floor((summary.startOffset / chapterHeight) * pageCount);
  return entry.pageStart + clamp(estimatedLocalPage, 0, pageCount - 1);
}

export function isChapterFlowManifestCompatible(
  manifest: ChapterFlowManifest,
  expectedIdentity: ChapterFlowManifestIdentity,
): boolean {
  if (manifest.status === 'missing' || manifest.status === 'stale') {
    return false;
  }

  return matchesExpectedIdentity(manifest.contentHash, expectedIdentity.contentHash)
    && matchesExpectedIdentity(manifest.layoutKey, expectedIdentity.layoutKey)
    && matchesExpectedIdentity(manifest.rendererVersion, expectedIdentity.rendererVersion)
    && matchesExpectedIdentity(manifest.layoutFeatureSet, expectedIdentity.layoutFeatureSet);
}

function matchesExpectedIdentity<T>(actual: T | undefined, expected: T | undefined): boolean {
  return expected === undefined || actual === expected;
}

function findEntryForGlobalOffset(
  entries: NovelFlowChapterEntry[],
  globalOffset: number,
): NovelFlowChapterEntry | null {
  const nonEmptyEntries = entries.filter((entry) => entry.scrollEnd > entry.scrollStart);
  if (nonEmptyEntries.length === 0) {
    return null;
  }

  for (const entry of nonEmptyEntries) {
    if (globalOffset >= entry.scrollStart && globalOffset < entry.scrollEnd) {
      return entry;
    }
  }

  return globalOffset >= nonEmptyEntries[nonEmptyEntries.length - 1].scrollEnd
    ? nonEmptyEntries[nonEmptyEntries.length - 1]
    : null;
}

function findBlockSummaryForLocator(
  entry: NovelFlowChapterEntry,
  locator: ReaderLocator,
): NovelFlowChapterEntry['blockSummaries'][number] | null {
  return entry.blockSummaries.find((summary) => (
    areLocatorsEquivalent(summary.startLocator, locator)
    || areLocatorsEquivalent(summary.endLocator, locator)
    || summaryLocatorIdentityMatches(summary.startLocator, locator)
    || summaryLocatorIdentityMatches(summary.endLocator, locator)
    || (
      summary.kind === locator.kind
      && summary.blockIndex === locator.blockIndex
      && (!locator.blockKey || !summary.blockKey || locator.blockKey === summary.blockKey)
    )
  )) ?? null;
}

function summaryLocatorIdentityMatches(
  summaryLocator: ReaderLocator | null | undefined,
  locator: ReaderLocator,
): boolean {
  if (!summaryLocator || summaryLocator.chapterIndex !== locator.chapterIndex) {
    return false;
  }

  if (
    locator.chapterKey
    && summaryLocator.chapterKey
    && locator.chapterKey !== summaryLocator.chapterKey
  ) {
    return false;
  }

  if (locator.kind && summaryLocator.kind !== locator.kind) {
    return false;
  }

  if (locator.anchorId && summaryLocator.anchorId === locator.anchorId) {
    return true;
  }

  if (locator.imageKey && summaryLocator.imageKey === locator.imageKey) {
    return true;
  }

  if (locator.blockKey && summaryLocator.blockKey === locator.blockKey) {
    return true;
  }

  if (locator.blockTextHash && summaryLocator.blockTextHash === locator.blockTextHash) {
    return true;
  }

  return Boolean(
    locator.textQuote?.exact
    && summaryLocator.textQuote?.exact
    && locator.textQuote.exact === summaryLocator.textQuote.exact,
  );
}

function normalizePageCount(pageCount: number | null | undefined): number {
  return Math.max(0, Math.floor(pageCount ?? 0));
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
