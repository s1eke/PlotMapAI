import type { CSSProperties } from 'react';
import type { Mark } from '@shared/contracts';

export const RICH_INLINE_SCRIPT_SCALE = 0.75;
export const RICH_INLINE_SUPERSCRIPT_OFFSET_EM = -0.35;
export const RICH_INLINE_SUBSCRIPT_OFFSET_EM = 0.15;

interface ParsedFontDescriptor {
  fontStyle: 'italic' | 'normal' | 'oblique';
  fontWeight: number;
  family: string;
}

export interface ResolvedRichInlineTypography {
  font: string;
  fontSizePx: number;
  fontStyle: 'italic' | 'normal' | 'oblique';
  fontWeight: number;
  verticalOffsetEm: number;
}

function parseNumericFontWeight(token: string | undefined): number | null {
  if (!token) {
    return null;
  }

  if (/^\d{3}$/.test(token)) {
    return Number.parseInt(token, 10);
  }

  if (token === 'bold') {
    return 700;
  }

  if (token === 'normal') {
    return 400;
  }

  return null;
}

function parseFontDescriptor(baseFont: string): ParsedFontDescriptor {
  const trimmedFont = baseFont.trim();
  const familyStartIndex = trimmedFont.indexOf('px ');
  const family = familyStartIndex >= 0
    ? trimmedFont.slice(familyStartIndex + 3).trim()
    : 'sans-serif';
  const prefix = familyStartIndex >= 0
    ? trimmedFont.slice(0, familyStartIndex).trim()
    : trimmedFont;
  const tokens = prefix.split(/\s+/).filter((token) => token.length > 0);

  let cursor = 0;
  let fontStyle: ParsedFontDescriptor['fontStyle'] = 'normal';
  if (
    tokens[cursor] === 'italic'
    || tokens[cursor] === 'normal'
    || tokens[cursor] === 'oblique'
  ) {
    fontStyle = tokens[cursor] as ParsedFontDescriptor['fontStyle'];
    cursor += 1;
  }

  const parsedWeight = parseNumericFontWeight(tokens[cursor]);
  const fontWeight = parsedWeight ?? 400;

  return {
    family: family.length > 0 ? family : 'sans-serif',
    fontStyle,
    fontWeight,
  };
}

function buildFontString(descriptor: {
  family: string;
  fontSizePx: number;
  fontStyle: ParsedFontDescriptor['fontStyle'];
  fontWeight: number;
}): string {
  const parts = [];
  if (descriptor.fontStyle !== 'normal') {
    parts.push(descriptor.fontStyle);
  }
  parts.push(String(descriptor.fontWeight));
  parts.push(`${descriptor.fontSizePx}px`);
  parts.push(descriptor.family);
  return parts.join(' ');
}

export function resolveRichInlineTypography(params: {
  baseFont: string;
  baseFontSizePx: number;
  marks?: readonly Mark[];
}): ResolvedRichInlineTypography {
  const {
    family,
    fontStyle: baseFontStyle,
    fontWeight: baseFontWeight,
  } = parseFontDescriptor(params.baseFont);
  let fontWeight = baseFontWeight;
  let fontStyle = baseFontStyle;
  let fontSizePx = params.baseFontSizePx;
  let verticalOffsetEm = 0;

  if (params.marks?.includes('bold')) {
    fontWeight = Math.max(fontWeight, 700);
  }

  if (params.marks?.includes('italic')) {
    fontStyle = 'italic';
  }

  if (params.marks?.includes('sup')) {
    fontSizePx = params.baseFontSizePx * RICH_INLINE_SCRIPT_SCALE;
    verticalOffsetEm = RICH_INLINE_SUPERSCRIPT_OFFSET_EM;
  } else if (params.marks?.includes('sub')) {
    fontSizePx = params.baseFontSizePx * RICH_INLINE_SCRIPT_SCALE;
    verticalOffsetEm = RICH_INLINE_SUBSCRIPT_OFFSET_EM;
  }

  return {
    font: buildFontString({
      family,
      fontSizePx,
      fontStyle,
      fontWeight,
    }),
    fontSizePx,
    fontStyle,
    fontWeight,
    verticalOffsetEm,
  };
}

export function getRichInlineTypographyStyle(params: {
  baseFont: string;
  baseFontSizePx: number;
  marks?: readonly Mark[];
}): CSSProperties | undefined {
  if (!params.marks || params.marks.length === 0) {
    return undefined;
  }

  const typography = resolveRichInlineTypography(params);
  const style: CSSProperties = {
    fontSize: `${typography.fontSizePx}px`,
    fontStyle: typography.fontStyle,
    fontWeight: typography.fontWeight,
  };

  if (typography.verticalOffsetEm !== 0) {
    style.position = 'relative';
    style.top = `${typography.verticalOffsetEm}em`;
    style.verticalAlign = 'baseline';
  }

  return style;
}
