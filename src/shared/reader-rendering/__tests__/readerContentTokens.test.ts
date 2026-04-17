import { describe, expect, it } from 'vitest';

import {
  createReaderContentMeasuredTokenValues,
  READER_CONTENT_MEASURED_TOKEN_NAMES,
  READER_CONTENT_MEASURED_TOKENS,
  READER_CONTENT_TOKEN_DEFAULTS,
  READER_CONTENT_VISUAL_TOKENS,
  resolveReaderHeadingFontSizePx,
  resolveReaderHeadingLineHeightPx,
} from '../readerContentTokens';

describe('readerContentTokens', () => {
  it('keeps measured and visual token names unique', () => {
    expect(new Set(READER_CONTENT_MEASURED_TOKENS).size)
      .toBe(READER_CONTENT_MEASURED_TOKENS.length);
    expect(new Set(READER_CONTENT_VISUAL_TOKENS).size)
      .toBe(READER_CONTENT_VISUAL_TOKENS.length);
  });

  it('resolves heading typography from viewport-sensitive defaults', () => {
    expect(resolveReaderHeadingFontSizePx(18, 320)).toBeCloseTo(24.3);
    expect(resolveReaderHeadingFontSizePx(18, 900)).toBe(28);
    expect(resolveReaderHeadingLineHeightPx(28)).toBeCloseTo(39.2);
  });

  it('creates a complete measured token map from reader preferences', () => {
    const tokenValues = createReaderContentMeasuredTokenValues({
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
      viewportWidth: 900,
    });

    expect(Object.keys(tokenValues)).toHaveLength(READER_CONTENT_MEASURED_TOKENS.length);
    expect(tokenValues[READER_CONTENT_MEASURED_TOKEN_NAMES.fontSize]).toBe(18);
    expect(tokenValues[READER_CONTENT_MEASURED_TOKEN_NAMES.lineHeight]).toBeCloseTo(32.4);
    expect(tokenValues[READER_CONTENT_MEASURED_TOKEN_NAMES.paragraphGap]).toBe(16);
    expect(tokenValues[READER_CONTENT_MEASURED_TOKEN_NAMES.headingFontSize]).toBe(28);
    expect(tokenValues[READER_CONTENT_MEASURED_TOKEN_NAMES.headingLineHeight])
      .toBeCloseTo(39.2);
    expect(tokenValues[READER_CONTENT_MEASURED_TOKEN_NAMES.imageBlockMarginAfter]).toBe(32);
    expect(tokenValues[READER_CONTENT_MEASURED_TOKEN_NAMES.tableMarginAfter]).toBe(32);
  });

  it('keeps the static defaults aligned with the existing reader layout values', () => {
    expect(READER_CONTENT_TOKEN_DEFAULTS.chapterTitleMarginTopPx).toBe(8);
    expect(READER_CONTENT_TOKEN_DEFAULTS.chapterTitleMarginBottomPx).toBe(32);
    expect(READER_CONTENT_TOKEN_DEFAULTS.headingMarginTopPx).toBe(10);
    expect(READER_CONTENT_TOKEN_DEFAULTS.headingMarginBottomPx).toBe(20);
    expect(READER_CONTENT_TOKEN_DEFAULTS.imageBlockMarginPx).toBe(16);
    expect(READER_CONTENT_TOKEN_DEFAULTS.imageCaptionGapPx).toBe(8);
    expect(READER_CONTENT_TOKEN_DEFAULTS.listMarkerWidthPx).toBe(24);
    expect(READER_CONTENT_TOKEN_DEFAULTS.listMarkerGapPx).toBe(8);
    expect(READER_CONTENT_TOKEN_DEFAULTS.listNestedIndentPx).toBe(20);
    expect(READER_CONTENT_TOKEN_DEFAULTS.blockquoteBorderWidthPx).toBe(2);
    expect(READER_CONTENT_TOKEN_DEFAULTS.blockquoteGapPx).toBe(10);
    expect(READER_CONTENT_TOKEN_DEFAULTS.blockquotePaddingPx).toBe(14);
    expect(READER_CONTENT_TOKEN_DEFAULTS.poemIndentPx).toBe(20);
    expect(READER_CONTENT_TOKEN_DEFAULTS.poemLineGapPx).toBe(6);
    expect(READER_CONTENT_TOKEN_DEFAULTS.hrHeightPx).toBe(1);
    expect(READER_CONTENT_TOKEN_DEFAULTS.hrMarginBeforePx).toBe(12);
    expect(READER_CONTENT_TOKEN_DEFAULTS.hrMarginAfterPx).toBe(20);
    expect(READER_CONTENT_TOKEN_DEFAULTS.tableMarginBeforePx).toBe(12);
    expect(READER_CONTENT_TOKEN_DEFAULTS.tableMarginAfterPx).toBe(16);
    expect(READER_CONTENT_TOKEN_DEFAULTS.tableBorderWidthPx).toBe(1);
    expect(READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingXPx).toBe(12);
    expect(READER_CONTENT_TOKEN_DEFAULTS.tableCellPaddingYPx).toBe(10);
    expect(READER_CONTENT_TOKEN_DEFAULTS.tableMinCellWidthPx).toBe(48);
  });
});
