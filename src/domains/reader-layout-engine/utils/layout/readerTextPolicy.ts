import { READER_CONTENT_TOKEN_DEFAULTS } from '@shared/reader-rendering';

export type ReaderTextWhiteSpace = 'normal' | 'pre-wrap';
export type ReaderTextWordBreak = 'normal' | 'keep-all';

export interface ReaderTextPrepareOptions {
  letterSpacingPx?: number;
  whiteSpace?: ReaderTextWhiteSpace;
  wordBreak?: ReaderTextWordBreak;
}

export type NormalizedReaderTextPrepareOptions = Required<ReaderTextPrepareOptions>;

export const READER_TEXT_LAYOUT_POLICY_VERSION = 1;
export const RICH_TEXT_STRATEGY_VERSION = 1;

export const DEFAULT_READER_TEXT_PREPARE_OPTIONS = {
  letterSpacingPx: 0,
  whiteSpace: 'normal',
  wordBreak: 'normal',
} as const satisfies NormalizedReaderTextPrepareOptions;

function normalizeSpacingValue(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_READER_TEXT_PREPARE_OPTIONS.letterSpacingPx;
  }

  return Object.is(value, -0) ? 0 : value;
}

function serializeSpacingValue(value: number): string {
  const normalized = normalizeSpacingValue(value);
  return normalized === 0 ? '0' : normalized.toFixed(4);
}

export function normalizeReaderTextPrepareOptions(
  options?: ReaderTextPrepareOptions,
): NormalizedReaderTextPrepareOptions {
  return {
    letterSpacingPx: normalizeSpacingValue(options?.letterSpacingPx),
    whiteSpace: options?.whiteSpace ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS.whiteSpace,
    wordBreak: options?.wordBreak ?? DEFAULT_READER_TEXT_PREPARE_OPTIONS.wordBreak,
  };
}

export function serializeReaderTextPrepareOptions(
  options?: ReaderTextPrepareOptions,
): string {
  const normalized = normalizeReaderTextPrepareOptions(options);
  return [
    `ws=${normalized.whiteSpace}`,
    `wb=${normalized.wordBreak}`,
    `ls=${serializeSpacingValue(normalized.letterSpacingPx)}`,
  ].join(';');
}

export function toPretextPrepareOptions(options?: ReaderTextPrepareOptions): {
  letterSpacing: number;
  whiteSpace: ReaderTextWhiteSpace;
  wordBreak: ReaderTextWordBreak;
} {
  const normalized = normalizeReaderTextPrepareOptions(options);
  return {
    letterSpacing: normalized.letterSpacingPx,
    whiteSpace: normalized.whiteSpace,
    wordBreak: normalized.wordBreak,
  };
}

export function createHeadingTextPrepareOptions(
  fontSizePx: number,
): NormalizedReaderTextPrepareOptions {
  return {
    ...DEFAULT_READER_TEXT_PREPARE_OPTIONS,
    letterSpacingPx: READER_CONTENT_TOKEN_DEFAULTS.headingLetterSpacingEm * fontSizePx,
  };
}

export const DEFAULT_READER_TEXT_LAYOUT_POLICY_KEY = [
  `text-v${READER_TEXT_LAYOUT_POLICY_VERSION}`,
  `body:${serializeReaderTextPrepareOptions(DEFAULT_READER_TEXT_PREPARE_OPTIONS)}`,
  `heading:ws=normal;wb=normal;ls-em=${serializeSpacingValue(
    READER_CONTENT_TOKEN_DEFAULTS.headingLetterSpacingEm,
  )}`,
  `rich-v${RICH_TEXT_STRATEGY_VERSION}`,
].join(',');
