export const READER_CONTENT_MEASURED_TOKEN_NAMES = {
  fontSize: '--pm-reader-font-size',
  lineHeight: '--pm-reader-line-height',
  paragraphGap: '--pm-reader-paragraph-gap',
  headingFontSize: '--pm-reader-heading-font-size',
  headingLineHeight: '--pm-reader-heading-line-height',
  headingMarginTop: '--pm-reader-heading-margin-top',
  headingMarginBottom: '--pm-reader-heading-margin-bottom',
  listMarkerWidth: '--pm-reader-list-marker-width',
  listMarkerGap: '--pm-reader-list-marker-gap',
  listNestedIndent: '--pm-reader-list-nested-indent',
  blockquoteBorderWidth: '--pm-reader-blockquote-border-width',
  blockquoteGap: '--pm-reader-blockquote-gap',
  blockquotePadding: '--pm-reader-blockquote-padding',
  poemIndent: '--pm-reader-poem-indent',
  poemLineGap: '--pm-reader-poem-line-gap',
  imageBlockMarginBefore: '--pm-reader-image-block-margin-before',
  imageBlockMarginAfter: '--pm-reader-image-block-margin-after',
  imageCaptionGap: '--pm-reader-image-caption-gap',
  hrHeight: '--pm-reader-hr-height',
  hrMarginBefore: '--pm-reader-hr-margin-before',
  hrMarginAfter: '--pm-reader-hr-margin-after',
  tableMarginBefore: '--pm-reader-table-margin-before',
  tableMarginAfter: '--pm-reader-table-margin-after',
  tableCellPaddingX: '--pm-reader-table-cell-padding-x',
  tableCellPaddingY: '--pm-reader-table-cell-padding-y',
} as const;

export const READER_CONTENT_MEASURED_TOKENS = Object.values(
  READER_CONTENT_MEASURED_TOKEN_NAMES,
) as ReadonlyArray<
  (typeof READER_CONTENT_MEASURED_TOKEN_NAMES)[keyof typeof READER_CONTENT_MEASURED_TOKEN_NAMES]
>;

export type ReaderContentMeasuredToken = (typeof READER_CONTENT_MEASURED_TOKENS)[number];

export const READER_CONTENT_VISUAL_TOKEN_NAMES = {
  bg: '--pm-reader-bg',
  surface: '--pm-reader-surface',
  text: '--pm-reader-text',
  textMuted: '--pm-reader-text-muted',
  border: '--pm-reader-border',
  accent: '--pm-reader-accent',
  link: '--pm-reader-link',
  selectionBg: '--pm-reader-selection-bg',
  imageRadius: '--pm-reader-image-radius',
  shadowSoft: '--pm-reader-shadow-soft',
  focusRing: '--pm-reader-focus-ring',
} as const;

export const READER_CONTENT_VISUAL_TOKENS = Object.values(
  READER_CONTENT_VISUAL_TOKEN_NAMES,
) as ReadonlyArray<
  (typeof READER_CONTENT_VISUAL_TOKEN_NAMES)[keyof typeof READER_CONTENT_VISUAL_TOKEN_NAMES]
>;

export type ReaderContentVisualToken = (typeof READER_CONTENT_VISUAL_TOKENS)[number];

export interface ReaderContentTokenDefaults {
  blockquoteBorderWidthPx: number;
  blockquoteGapPx: number;
  blockquotePaddingPx: number;
  chapterTitleMarginBottomPx: number;
  chapterTitleMarginTopPx: number;
  headingLineHeightMultiplier: number;
  headingLetterSpacingEm: number;
  headingMarginBottomPx: number;
  headingMarginTopPx: number;
  headingMinFontSizeNarrowViewportPx: number;
  headingMinFontSizeWideViewportPx: number;
  headingScale: number;
  hrHeightPx: number;
  hrMarginAfterPx: number;
  hrMarginBeforePx: number;
  imageBlockMarginPx: number;
  imageCaptionGapPx: number;
  listMarkerGapPx: number;
  listMarkerWidthPx: number;
  listNestedIndentPx: number;
  narrowViewportBreakpointPx: number;
  poemIndentPx: number;
  poemLineGapPx: number;
  tableBorderWidthPx: number;
  tableCellPaddingXPx: number;
  tableCellPaddingYPx: number;
  tableMarginAfterPx: number;
  tableMarginBeforePx: number;
  tableMinCellWidthPx: number;
}

export const READER_CONTENT_TOKEN_DEFAULTS = {
  blockquoteBorderWidthPx: 2,
  blockquoteGapPx: 10,
  blockquotePaddingPx: 14,
  chapterTitleMarginBottomPx: 32,
  chapterTitleMarginTopPx: 8,
  headingLineHeightMultiplier: 1.4,
  headingLetterSpacingEm: -0.015,
  headingMarginBottomPx: 20,
  headingMarginTopPx: 10,
  headingMinFontSizeNarrowViewportPx: 24,
  headingMinFontSizeWideViewportPx: 28,
  headingScale: 1.35,
  hrHeightPx: 1,
  hrMarginAfterPx: 20,
  hrMarginBeforePx: 12,
  imageBlockMarginPx: 16,
  imageCaptionGapPx: 8,
  listMarkerGapPx: 8,
  listMarkerWidthPx: 24,
  listNestedIndentPx: 20,
  narrowViewportBreakpointPx: 640,
  poemIndentPx: 20,
  poemLineGapPx: 6,
  tableBorderWidthPx: 1,
  tableCellPaddingXPx: 12,
  tableCellPaddingYPx: 10,
  tableMarginAfterPx: 16,
  tableMarginBeforePx: 12,
  tableMinCellWidthPx: 48,
} as const satisfies ReaderContentTokenDefaults;

export interface ReaderContentMeasuredTokenParams {
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  viewportWidth: number;
}

export type ReaderContentMeasuredTokenValues = Record<ReaderContentMeasuredToken, number>;

export function resolveReaderHeadingFontSizePx(
  fontSize: number,
  viewportWidth: number,
  defaults: ReaderContentTokenDefaults = READER_CONTENT_TOKEN_DEFAULTS,
): number {
  const minHeadingFontSize = viewportWidth >= defaults.narrowViewportBreakpointPx
    ? defaults.headingMinFontSizeWideViewportPx
    : defaults.headingMinFontSizeNarrowViewportPx;

  return Math.max(fontSize * defaults.headingScale, minHeadingFontSize);
}

export function resolveReaderHeadingLineHeightPx(
  headingFontSize: number,
  defaults: ReaderContentTokenDefaults = READER_CONTENT_TOKEN_DEFAULTS,
): number {
  return Math.max(1, headingFontSize * defaults.headingLineHeightMultiplier);
}

export function createReaderContentMeasuredTokenValues(
  params: ReaderContentMeasuredTokenParams,
  defaults: ReaderContentTokenDefaults = READER_CONTENT_TOKEN_DEFAULTS,
): ReaderContentMeasuredTokenValues {
  const headingFontSize = resolveReaderHeadingFontSizePx(
    params.fontSize,
    params.viewportWidth,
    defaults,
  );

  return {
    [READER_CONTENT_MEASURED_TOKEN_NAMES.fontSize]: params.fontSize,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.lineHeight]: Math.max(
      1,
      params.fontSize * params.lineSpacing,
    ),
    [READER_CONTENT_MEASURED_TOKEN_NAMES.paragraphGap]: params.paragraphSpacing,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.headingFontSize]: headingFontSize,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.headingLineHeight]:
      resolveReaderHeadingLineHeightPx(headingFontSize, defaults),
    [READER_CONTENT_MEASURED_TOKEN_NAMES.headingMarginTop]:
      defaults.headingMarginTopPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.headingMarginBottom]:
      defaults.headingMarginBottomPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.listMarkerWidth]:
      defaults.listMarkerWidthPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.listMarkerGap]:
      defaults.listMarkerGapPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.listNestedIndent]:
      defaults.listNestedIndentPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.blockquoteBorderWidth]:
      defaults.blockquoteBorderWidthPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.blockquoteGap]:
      defaults.blockquoteGapPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.blockquotePadding]:
      defaults.blockquotePaddingPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.poemIndent]:
      defaults.poemIndentPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.poemLineGap]:
      defaults.poemLineGapPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.imageBlockMarginBefore]:
      defaults.imageBlockMarginPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.imageBlockMarginAfter]:
      defaults.imageBlockMarginPx + params.paragraphSpacing,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.imageCaptionGap]:
      defaults.imageCaptionGapPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.hrHeight]:
      defaults.hrHeightPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.hrMarginBefore]:
      defaults.hrMarginBeforePx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.hrMarginAfter]:
      defaults.hrMarginAfterPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.tableMarginBefore]:
      defaults.tableMarginBeforePx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.tableMarginAfter]:
      defaults.tableMarginAfterPx + params.paragraphSpacing,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.tableCellPaddingX]:
      defaults.tableCellPaddingXPx,
    [READER_CONTENT_MEASURED_TOKEN_NAMES.tableCellPaddingY]:
      defaults.tableCellPaddingYPx,
  };
}
