import type { PreparedTextWithSegments } from '@chenglou/pretext';
import { prepareWithSegments } from '@chenglou/pretext';
import type { ReaderTextPrepareOptions } from '../layout/readerTextPolicy';
import {
  normalizeReaderTextPrepareOptions,
  serializeReaderTextPrepareOptions,
  toPretextPrepareOptions,
} from '../layout/readerTextPolicy';

const MAX_PRETEXT_CACHE_SIZE = 256;
const PRETEXT_CACHE = new Map<string, PreparedTextWithSegments | null>();

export interface PreparedTextBlock {
  font: string;
  prepared: PreparedTextWithSegments | null;
  prepareOptions: ReaderTextPrepareOptions;
  text: string;
}

function getPreparedTextFromCache(key: string): PreparedTextWithSegments | null | undefined {
  const prepared = PRETEXT_CACHE.get(key);
  if (prepared === undefined) {
    return undefined;
  }

  PRETEXT_CACHE.delete(key);
  PRETEXT_CACHE.set(key, prepared);
  return prepared;
}

function setPreparedTextInCache(key: string, prepared: PreparedTextWithSegments | null): void {
  if (PRETEXT_CACHE.has(key)) {
    PRETEXT_CACHE.delete(key);
  }

  PRETEXT_CACHE.set(key, prepared);
  while (PRETEXT_CACHE.size > MAX_PRETEXT_CACHE_SIZE) {
    const oldestKey = PRETEXT_CACHE.keys().next().value;
    if (!oldestKey) {
      return;
    }
    PRETEXT_CACHE.delete(oldestKey);
  }
}

function prepareText(
  text: string,
  font: string,
  prepareOptions: ReaderTextPrepareOptions,
): PreparedTextWithSegments | null {
  try {
    return prepareWithSegments(text, font, toPretextPrepareOptions(prepareOptions));
  } catch {
    return null;
  }
}

export function createPreparedTextBlock(
  text: string,
  font: string,
  prepareOptions?: ReaderTextPrepareOptions,
): PreparedTextBlock {
  const normalizedOptions = normalizeReaderTextPrepareOptions(prepareOptions);
  const key = `${font}\u0000${serializeReaderTextPrepareOptions(normalizedOptions)}\u0000${text}`;
  let prepared = getPreparedTextFromCache(key);
  if (prepared === undefined) {
    prepared = prepareText(text, font, normalizedOptions);
    setPreparedTextInCache(key, prepared);
  }

  return {
    font,
    prepared,
    prepareOptions: normalizedOptions,
    text,
  };
}

export function getPreparedTextCacheSizeForTests(): number {
  return PRETEXT_CACHE.size;
}

export function resetPreparedTextCache(): void {
  PRETEXT_CACHE.clear();
}
