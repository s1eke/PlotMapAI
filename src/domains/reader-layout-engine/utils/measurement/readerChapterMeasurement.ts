import type { ChapterContent } from '@shared/contracts/reader';
import type { ReaderImageDimensions } from '@domains/reader-media';
import type {
  MeasuredChapterLayout,
  ReaderImageLayoutConstraints,
  ReaderTypographyMetrics,
  VirtualBlockMetrics,
} from '../layout/readerLayoutTypes';
import type { ReaderTextLayoutEngine } from './readerTextMeasurement';

import {
  buildPagedReaderBlocks,
  buildReaderBlocks,
  resolveReaderImageSize,
} from '../layout/readerLayoutShared';
import {
  buildRichScrollReaderBlocks,
  getRichScrollHorizontalTextWidth,
  getRichScrollRuleHeight,
  shouldUseRichScrollBlocks,
} from '../layout/richScroll';
import { getRichInlinePlainText } from '@shared/text-processing';
import { createRichLineFragments } from '../typography/richLineFragments';

import { measureCaptionLines, measureTableRows } from './readerBlockMeasurement';
import { browserReaderTextLayoutEngine } from './readerTextMeasurement';

export function measureReaderBlocks(params: {
  blocks: ReturnType<typeof buildReaderBlocks>;
  chapterIndex: number;
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>;
  imageLayoutConstraints?: ReaderImageLayoutConstraints;
  preferRichTextLayout?: boolean;
  renderMode: MeasuredChapterLayout['renderMode'];
  richAware: boolean;
  textLayoutEngine: ReaderTextLayoutEngine;
  typography: ReaderTypographyMetrics;
  width: number;
}): MeasuredChapterLayout {
  const metrics: VirtualBlockMetrics[] = [];
  let offsetTop = 0;

  for (const block of params.blocks) {
    let blockMetrics: VirtualBlockMetrics;

    if (block.kind === 'heading' || block.kind === 'text') {
      const font = block.kind === 'heading'
        ? params.typography.headingFont
        : params.typography.bodyFont;
      const fontSizePx = block.kind === 'heading'
        ? params.typography.headingFontSize
        : params.typography.bodyFontSize;
      const lineHeightPx = block.kind === 'heading'
        ? params.typography.headingLineHeightPx
        : params.typography.bodyLineHeightPx;
      const maxWidth = params.richAware
        ? getRichScrollHorizontalTextWidth(block, params.width)
        : params.width;

      if (block.renderRole === 'table' && block.tableRows) {
        const tableMetrics = measureTableRows({
          lineHeightPx,
          maxWidth,
          preferRichTextLayout: params.preferRichTextLayout,
          tableRows: block.tableRows,
          textLayoutEngine: params.textLayoutEngine,
          typography: params.typography,
        });

        blockMetrics = {
          block,
          contentHeight: tableMetrics.contentHeight,
          font,
          fontSizePx,
          fontWeight: 400,
          height: block.marginBefore + tableMetrics.contentHeight + block.marginAfter,
          lineHeightPx,
          lines: [],
          marginAfter: block.marginAfter,
          marginBefore: block.marginBefore,
          tableRowHeights: tableMetrics.rowHeights,
          top: offsetTop,
        };
      } else if (block.renderRole === 'hr') {
        blockMetrics = {
          block,
          contentHeight: getRichScrollRuleHeight(),
          font,
          fontSizePx,
          fontWeight: 400,
          height: block.marginBefore + getRichScrollRuleHeight() + block.marginAfter,
          lineHeightPx,
          lines: [],
          marginAfter: block.marginAfter,
          marginBefore: block.marginBefore,
          top: offsetTop,
        };
      } else {
        const richLayout = params.preferRichTextLayout
          && block.richChildren
          && block.richChildren.length > 0
          && params.textLayoutEngine.layoutRichLines
          ? params.textLayoutEngine.layoutRichLines({
            font,
            fontSizePx,
            inlines: block.richChildren,
            lineHeightPx,
            maxWidth,
          })
          : null;
        const lines = richLayout?.lines ?? params.textLayoutEngine.layoutLines({
          font,
          fontSizePx,
          lineHeightPx,
          maxWidth,
          text: block.text ?? '',
        });
        const contentHeight = lines.length * lineHeightPx;

        blockMetrics = {
          block,
          contentHeight,
          font,
          fontSizePx,
          fontWeight: block.kind === 'heading' ? 700 : 400,
          height: block.marginBefore + contentHeight + block.marginAfter,
          lineHeightPx,
          lines,
          marginAfter: block.marginAfter,
          marginBefore: block.marginBefore,
          richLineFragments: richLayout?.richLineFragments
            ?? (
              block.richChildren
                ? createRichLineFragments(block.richChildren, lines)
                : undefined
            ),
          top: offsetTop,
        };
      }
    } else if (block.kind === 'image') {
      const availableWidth = params.richAware
        ? getRichScrollHorizontalTextWidth(block, params.width)
        : params.width;
      const resolvedImageSize = resolveReaderImageSize(
        availableWidth,
        block.imageKey,
        params.imageDimensionsByKey,
        params.imageLayoutConstraints,
      );
      const displayWidth = resolvedImageSize.width;
      const displayHeight = resolvedImageSize.height;
      const captionMetrics = measureCaptionLines({
        captionInlines: block.imageCaption ?? [],
        captionText: getRichInlinePlainText(block.imageCaption ?? []),
        lineHeightPx: params.typography.bodyLineHeightPx,
        maxWidth: displayWidth,
        preferRichTextLayout: params.preferRichTextLayout,
        textLayoutEngine: params.textLayoutEngine,
        typography: params.typography,
      });
      const contentHeight =
        displayHeight
        + (captionMetrics.captionSpacing ?? 0)
        + (captionMetrics.captionHeight ?? 0);

      blockMetrics = {
        block,
        ...captionMetrics,
        contentHeight,
        displayHeight,
        displayWidth,
        font: params.typography.bodyFont,
        fontSizePx: params.typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginBefore + contentHeight + block.marginAfter,
        lineHeightPx: params.typography.bodyLineHeightPx,
        lines: [],
        marginAfter: block.marginAfter,
        marginBefore: block.marginBefore,
        top: offsetTop,
      };
    } else {
      blockMetrics = {
        block,
        contentHeight: 0,
        font: params.typography.bodyFont,
        fontSizePx: params.typography.bodyFontSize,
        fontWeight: 400,
        height: block.marginAfter,
        lineHeightPx: params.typography.bodyLineHeightPx,
        lines: [],
        marginAfter: block.marginAfter,
        marginBefore: 0,
        top: offsetTop,
      };
    }

    metrics.push(blockMetrics);
    offsetTop += blockMetrics.height;
  }

  return {
    blockCount: params.blocks.length,
    chapterIndex: params.chapterIndex,
    metrics,
    renderMode: params.renderMode,
    textWidth: params.width,
    totalHeight: offsetTop,
  };
}

export function measureReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
  textLayoutEngine: ReaderTextLayoutEngine = browserReaderTextLayoutEngine,
): MeasuredChapterLayout {
  return measureReaderBlocks({
    blocks: buildReaderBlocks(chapter, typography.paragraphSpacing),
    chapterIndex: chapter.index,
    imageDimensionsByKey,
    imageLayoutConstraints,
    preferRichTextLayout: false,
    renderMode: 'plain',
    richAware: false,
    textLayoutEngine,
    typography,
    width,
  });
}

export function measurePagedReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  textLayoutEngine: ReaderTextLayoutEngine = browserReaderTextLayoutEngine,
): MeasuredChapterLayout {
  const richAware = shouldUseRichScrollBlocks(chapter);

  return measureReaderBlocks({
    blocks: buildPagedReaderBlocks(chapter, typography.paragraphSpacing),
    chapterIndex: chapter.index,
    imageDimensionsByKey,
    preferRichTextLayout: richAware,
    renderMode: richAware ? 'rich' : 'plain',
    richAware,
    textLayoutEngine,
    typography,
    width,
  });
}

export function measureScrollReaderChapterLayout(
  chapter: ChapterContent,
  width: number,
  typography: ReaderTypographyMetrics,
  imageDimensionsByKey: Map<string, ReaderImageDimensions | null | undefined>,
  imageLayoutConstraints?: ReaderImageLayoutConstraints,
  textLayoutEngine: ReaderTextLayoutEngine = browserReaderTextLayoutEngine,
  preferRichScrollRendering = true,
): MeasuredChapterLayout {
  if (!shouldUseRichScrollBlocks(chapter, preferRichScrollRendering)) {
    return measureReaderChapterLayout(
      chapter,
      width,
      typography,
      imageDimensionsByKey,
      imageLayoutConstraints,
      textLayoutEngine,
    );
  }

  return measureReaderBlocks({
    blocks: buildRichScrollReaderBlocks(chapter, typography.paragraphSpacing),
    chapterIndex: chapter.index,
    imageDimensionsByKey,
    imageLayoutConstraints,
    preferRichTextLayout: true,
    renderMode: 'rich',
    richAware: true,
    textLayoutEngine,
    typography,
    width,
  });
}
