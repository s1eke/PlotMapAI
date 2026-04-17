import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderImageDimensions } from '@domains/reader-media';
import type {
  ReaderBlock,
  ReaderImageLayoutConstraints,
  ReaderLayoutSignature,
  ReaderViewportMetrics,
} from './readerLayoutTypes';

import { buildChapterBlockSequence } from '@shared/text-processing/chapterBlocks';
import { READER_CONTENT_TOKEN_DEFAULTS } from '@shared/reader-rendering';

import {
  buildRichScrollReaderBlocks,
  shouldUseRichScrollBlocks,
} from './richScroll';

const DEFAULT_IMAGE_ASPECT_RATIO = 4 / 3;
const TEXT_FALLBACK_WIDTH_RATIO = 0.55;
const MIN_TWO_COLUMN_WIDTH_PX = 360;
const PORTRAIT_PAGED_RATIO_THRESHOLD = 1.1;
const TWO_COLUMN_TARGET_CHARS_PER_LINE = 20;

export function createReaderViewportMetrics(
  scrollViewportWidth: number,
  scrollViewportHeight: number,
  pagedViewportWidth: number,
  pagedViewportHeight: number,
  bodyFontSize = 18,
): ReaderViewportMetrics {
  let scrollHorizontalPadding = 16;
  if (scrollViewportWidth >= 768) {
    scrollHorizontalPadding = 48;
  } else if (scrollViewportWidth >= 640) {
    scrollHorizontalPadding = 32;
  }
  const scrollAvailableWidth = Math.max(0, scrollViewportWidth - scrollHorizontalPadding * 2);
  const scrollTextWidth = scrollAvailableWidth <= 0
    ? 0
    : Math.min(scrollAvailableWidth, Math.max(scrollAvailableWidth * 0.78, 640), 920);

  const pagedColumnGap = pagedViewportWidth >= 960 ? 48 : 32;
  const minComfortableColumnWidth = Math.max(
    MIN_TWO_COLUMN_WIDTH_PX,
    bodyFontSize * TWO_COLUMN_TARGET_CHARS_PER_LINE,
  );
  const isPortraitPagedViewport =
    pagedViewportHeight > pagedViewportWidth * PORTRAIT_PAGED_RATIO_THRESHOLD;
  const pagedFitsTwoColumns = !isPortraitPagedViewport
    && pagedViewportWidth >= minComfortableColumnWidth * 2 + pagedColumnGap;
  const pagedColumnCount = pagedFitsTwoColumns ? 2 : 1;
  const pagedColumnWidth = pagedColumnCount === 2
    ? Math.max((pagedViewportWidth - pagedColumnGap) / 2, 0)
    : Math.max(pagedViewportWidth, 0);

  return {
    scrollViewportHeight,
    scrollViewportWidth,
    scrollTextWidth,
    pagedViewportHeight,
    pagedViewportWidth,
    pagedColumnCount,
    pagedColumnWidth,
    pagedColumnGap,
    pagedFitsTwoColumns,
  };
}

export function createReaderLayoutSignature({
  columnCount,
  columnGap,
  fontSize,
  lineSpacing,
  pageHeight,
  paragraphSpacing,
  textWidth,
}: ReaderLayoutSignature): ReaderLayoutSignature {
  return {
    columnCount,
    columnGap,
    fontSize,
    lineSpacing,
    pageHeight,
    paragraphSpacing,
    textWidth,
  };
}

export function serializeReaderLayoutSignature(signature: ReaderLayoutSignature): string {
  return [
    signature.textWidth,
    signature.pageHeight,
    signature.columnCount,
    signature.columnGap,
    signature.fontSize,
    signature.lineSpacing,
    signature.paragraphSpacing,
  ]
    .map((value) => (Number.isFinite(value) ? value.toFixed(3) : '0'))
    .join('|');
}

export function buildReaderBlocks(
  chapter: ChapterContent,
  paragraphSpacing: number,
): ReaderBlock[] {
  // The chapter title is the single source of truth for every rendered heading.
  const blocks: ReaderBlock[] = [{
    chapterIndex: chapter.index,
    blockIndex: 0,
    key: `${chapter.index}:heading:0`,
    kind: 'heading',
    text: chapter.title,
    marginBefore: READER_CONTENT_TOKEN_DEFAULTS.chapterTitleMarginTopPx,
    marginAfter: READER_CONTENT_TOKEN_DEFAULTS.chapterTitleMarginBottomPx,
    paragraphIndex: -1,
    renderRole: 'plain',
  }];

  blocks.push(...buildChapterBlockSequence({
    content: chapter.plainText,
    index: chapter.index,
    title: chapter.title,
  }).map((block): ReaderBlock => {
    if (block.kind === 'blank') {
      return {
        chapterIndex: block.chapterIndex,
        blockIndex: block.blockIndex,
        key: `${chapter.index}:blank:${block.blockIndex}`,
        kind: 'blank',
        marginBefore: 0,
        marginAfter: paragraphSpacing,
        paragraphIndex: block.paragraphIndex,
      };
    }

    if (block.kind === 'image') {
      return {
        chapterIndex: block.chapterIndex,
        blockIndex: block.blockIndex,
        imageKey: block.imageKey,
        key: `${chapter.index}:image:${block.blockIndex}`,
        kind: 'image',
        marginBefore: READER_CONTENT_TOKEN_DEFAULTS.imageBlockMarginPx,
        marginAfter:
          READER_CONTENT_TOKEN_DEFAULTS.imageBlockMarginPx +
          (block.hasParagraphSpacingAfter ? paragraphSpacing : 0),
        paragraphIndex: block.paragraphIndex,
        renderRole: 'plain',
      };
    }

    return {
      chapterIndex: block.chapterIndex,
      blockIndex: block.blockIndex,
      key: `${chapter.index}:text:${block.blockIndex}`,
      kind: 'text',
      marginBefore: 0,
      marginAfter: block.hasParagraphSpacingAfter ? paragraphSpacing : 0,
      paragraphIndex: block.paragraphIndex,
      renderRole: 'plain',
      text: block.text,
    };
  }));

  return blocks;
}

export function buildPagedReaderBlocks(
  chapter: ChapterContent,
  paragraphSpacing: number,
): ReaderBlock[] {
  if (shouldUseRichScrollBlocks(chapter)) {
    return buildRichScrollReaderBlocks(chapter, paragraphSpacing);
  }

  return buildReaderBlocks(chapter, paragraphSpacing);
}

export function createChapterContentHash(
  chapter: Pick<
    ChapterContent,
    'contentFormat' | 'contentVersion' | 'index' | 'plainText' | 'richBlocks' | 'title'
  >,
): string {
  const source = `${chapter.index}\u0000${chapter.title}\u0000${chapter.plainText}\u0000${chapter.contentFormat}\u0000${chapter.contentVersion}\u0000${JSON.stringify(chapter.richBlocks)}`;
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  const UINT32_MOD = 0x1_0000_0000;

  const normalizeUint32 = (value: number): number => {
    const normalized = value % UINT32_MOD;
    return normalized >= 0 ? normalized : normalized + UINT32_MOD;
  };

  for (let index = 0; index < source.length; index += 1) {
    const value = source.charCodeAt(index);
    hashA = normalizeUint32(Math.imul(hashA, 0x01000193) + value);
    hashB = normalizeUint32(Math.imul(hashB, 0x27d4eb2d) + value);
  }

  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

export function getApproximateMaxCharsPerLine(maxWidth: number, fontSizePx: number): number {
  return Math.max(
    1,
    Math.floor(maxWidth / Math.max(fontSizePx * TEXT_FALLBACK_WIDTH_RATIO, 1)),
  );
}

export function resolveConstrainedImageSize(
  baseDisplayWidth: number,
  aspectRatio: number,
  constraints?: ReaderImageLayoutConstraints,
): {
    height: number;
    width: number;
  } {
  let displayWidth = Math.max(1, baseDisplayWidth);
  let displayHeight = Math.max(1, displayWidth / aspectRatio);

  const maxImageWidth = constraints?.maxImageWidth;
  if (
    typeof maxImageWidth === 'number'
    && Number.isFinite(maxImageWidth)
    && maxImageWidth > 0
    && displayWidth > maxImageWidth
  ) {
    const scale = maxImageWidth / displayWidth;
    displayWidth *= scale;
    displayHeight *= scale;
  }

  const maxImageHeight = constraints?.maxImageHeight;
  if (
    typeof maxImageHeight === 'number'
    && Number.isFinite(maxImageHeight)
    && maxImageHeight > 0
    && displayHeight > maxImageHeight
  ) {
    const scale = maxImageHeight / displayHeight;
    displayWidth *= scale;
    displayHeight *= scale;
  }

  return {
    height: Math.max(1, displayHeight),
    width: Math.max(1, displayWidth),
  };
}

export function resolveReaderImageSize(
  width: number,
  imageKey: string | undefined,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  constraints?: ReaderImageLayoutConstraints,
): {
    height: number;
    width: number;
  } {
  const dimensions = imageKey
    ? imageDimensionsByKey.get(imageKey) ?? null
    : null;
  const naturalWidth = Math.max(dimensions?.width ?? width, 1);
  const aspectRatio = dimensions?.aspectRatio && Number.isFinite(dimensions.aspectRatio)
    ? dimensions.aspectRatio
    : DEFAULT_IMAGE_ASPECT_RATIO;

  return resolveConstrainedImageSize(
    Math.min(width, naturalWidth),
    aspectRatio,
    constraints,
  );
}
