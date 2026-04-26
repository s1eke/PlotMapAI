import type { RichInline } from '@shared/contracts';
import type {
  ReaderTypographyMetrics,
  VirtualBlockMetrics,
} from '../layout/readerLayoutTypes';
import type { ReaderTextLayoutEngine } from './readerTextMeasurement';

import { READER_CONTENT_TOKEN_DEFAULTS } from '@shared/reader-rendering';
import { getRichInlinePlainText } from '@shared/text-processing';
import { DEFAULT_READER_TEXT_PREPARE_OPTIONS } from '../layout/readerTextPolicy';
import { measureTextHeightWithBrowserLayout } from './readerTextMeasurement';

export function measureCaptionLines(params: {
  captionInlines?: RichInline[];
  captionText: string;
  lineHeightPx: number;
  maxWidth: number;
  preferRichTextLayout?: boolean;
  textLayoutEngine: ReaderTextLayoutEngine;
  typography: ReaderTypographyMetrics;
}): Pick<
  VirtualBlockMetrics,
  | 'captionFont'
  | 'captionFontSizePx'
  | 'captionHeight'
  | 'captionLineHeightPx'
  | 'captionLines'
  | 'captionRichLineFragments'
  | 'captionSpacing'
> {
  const richCaptionLayout = params.preferRichTextLayout
    && params.captionInlines
    && params.captionInlines.length > 0
    && params.textLayoutEngine.layoutRichLines
    ? params.textLayoutEngine.layoutRichLines({
      font: params.typography.bodyFont,
      fontSizePx: params.typography.bodyFontSize,
      inlines: params.captionInlines,
      lineHeightPx: params.lineHeightPx,
      maxWidth: params.maxWidth,
      prepareOptions: DEFAULT_READER_TEXT_PREPARE_OPTIONS,
    })
    : null;
  const captionLines = richCaptionLayout?.lines ?? (
    params.captionText.length > 0
      ? params.textLayoutEngine.layoutLines({
        font: params.typography.bodyFont,
        fontSizePx: params.typography.bodyFontSize,
        lineHeightPx: params.lineHeightPx,
        maxWidth: params.maxWidth,
        prepareOptions: DEFAULT_READER_TEXT_PREPARE_OPTIONS,
        text: params.captionText,
      })
      : []
  );
  const measuredCaptionHeight = captionLines.length * params.lineHeightPx;
  const browserCaptionHeight = richCaptionLayout
    ? null
    : measureTextHeightWithBrowserLayout({
      font: params.typography.bodyFont,
      fontSizePx: params.typography.bodyFontSize,
      lineHeightPx: params.lineHeightPx,
      maxWidth: params.maxWidth,
      prepareOptions: DEFAULT_READER_TEXT_PREPARE_OPTIONS,
      text: params.captionText,
    });
  const captionHeight = Math.max(measuredCaptionHeight, browserCaptionHeight ?? 0);

  return {
    captionFont: params.typography.bodyFont,
    captionFontSizePx: params.typography.bodyFontSize,
    captionHeight,
    captionLineHeightPx: params.lineHeightPx,
    captionLines,
    captionRichLineFragments: richCaptionLayout?.richLineFragments,
    captionSpacing: captionLines.length > 0
      ? READER_CONTENT_TOKEN_DEFAULTS.imageCaptionGapPx
      : 0,
  };
}

export function measureTableRows(params: {
  lineHeightPx: number;
  maxWidth: number;
  preferRichTextLayout?: boolean;
  tableRows: NonNullable<VirtualBlockMetrics['block']['tableRows']>;
  textLayoutEngine: ReaderTextLayoutEngine;
  typography: ReaderTypographyMetrics;
}): {
    contentHeight: number;
    rowHeights: number[];
  } {
  if (params.tableRows.length === 0) {
    return {
      contentHeight: 0,
      rowHeights: [],
    };
  }

  const columnCount = Math.max(
    ...params.tableRows.map((row) => row.length),
    1,
  );
  const totalHorizontalPadding =
    columnCount * READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingXPx * 2
    + (columnCount + 1) * READER_CONTENT_TOKEN_DEFAULTS.tableBorderWidthPx;
  const cellMaxWidth = Math.max(
    READER_CONTENT_TOKEN_DEFAULTS.tableMinCellWidthPx,
    (params.maxWidth - totalHorizontalPadding) / columnCount,
  );
  const rowHeights = params.tableRows.map((row) => {
    const maxCellHeight = Math.max(...row.map((cell) => {
      const cellText = getRichInlinePlainText(cell.children);
      const richCellLayout = params.preferRichTextLayout
        && cell.children.length > 0
        && params.textLayoutEngine.layoutRichLines
        ? params.textLayoutEngine.layoutRichLines({
          font: params.typography.bodyFont,
          fontSizePx: params.typography.bodyFontSize,
          inlines: cell.children,
          lineHeightPx: params.lineHeightPx,
          maxWidth: cellMaxWidth,
          prepareOptions: DEFAULT_READER_TEXT_PREPARE_OPTIONS,
        })
        : null;
      const measuredLines = richCellLayout?.lines ?? (
        cellText.length > 0
          ? params.textLayoutEngine.layoutLines({
            font: params.typography.bodyFont,
            fontSizePx: params.typography.bodyFontSize,
            lineHeightPx: params.lineHeightPx,
            maxWidth: cellMaxWidth,
            prepareOptions: DEFAULT_READER_TEXT_PREPARE_OPTIONS,
            text: cellText,
          })
          : []
      );

      return Math.max(measuredLines.length, 1) * params.lineHeightPx
        + READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingYPx * 2;
    }), params.lineHeightPx + READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingYPx * 2);

    return maxCellHeight;
  });
  const borderHeight =
    (params.tableRows.length + 1) * READER_CONTENT_TOKEN_DEFAULTS.tableBorderWidthPx;

  return {
    contentHeight: rowHeights.reduce((total, height) => total + height, 0) + borderHeight,
    rowHeights,
  };
}
