import { describe, expect, it } from 'vitest';

import {
  buildStoredReaderState,
  createCanonicalPositionFingerprint,
  getReaderRestoreTargetBoundary,
  getReaderRestoreTargetLocator,
  isReaderProjectionFreshForCanonical,
  mergeStoredReaderState,
  sanitizeCanonicalPositionV2,
  toCanonicalPositionFromLocator,
  toCanonicalPositionV2FromCanonical,
  toReaderLocatorFromCanonicalV2,
  toReaderLocatorFromCanonical,
} from '../readerStoredState';

describe('readerStoredState canonical metadata', () => {
  it('round-trips stable locator identity through canonical positions', () => {
    const canonical = toCanonicalPositionFromLocator({
      chapterIndex: 2,
      chapterKey: 'epub:ch2:chapter.xhtml',
      blockIndex: 8,
      blockKey: 'anchor:intro',
      anchorId: 'intro',
      kind: 'text',
      lineIndex: 1,
      pageIndex: 4,
      textQuote: {
        exact: 'quoted text',
        prefix: 'before ',
        suffix: ' after',
      },
      blockTextHash: 'block-hash',
      contentVersion: 3,
      importFormatVersion: 1,
      contentHash: 'content-hash',
    });

    expect(canonical).toEqual({
      chapterIndex: 2,
      chapterKey: 'epub:ch2:chapter.xhtml',
      blockIndex: 8,
      blockKey: 'anchor:intro',
      anchorId: 'intro',
      kind: 'text',
      lineIndex: 1,
      textQuote: {
        exact: 'quoted text',
        prefix: 'before ',
        suffix: ' after',
      },
      blockTextHash: 'block-hash',
      contentVersion: 3,
      importFormatVersion: 1,
      contentHash: 'content-hash',
    });
    expect(toReaderLocatorFromCanonical(canonical, 4)).toMatchObject({
      pageIndex: 4,
      blockKey: 'anchor:intro',
      textQuote: {
        exact: 'quoted text',
      },
    });
  });

  it('normalizes legacy canonical positions into CanonicalPositionV2', () => {
    const position = toCanonicalPositionV2FromCanonical({
      chapterIndex: 2,
      chapterKey: 'epub:item:chapter.xhtml',
      blockIndex: 5,
      blockKey: 'text:5:hash',
      kind: 'text',
      lineIndex: 1,
      textQuote: {
        exact: 'quoted text',
      },
      contentHash: 'content-hash',
    });

    expect(position).toEqual({
      type: 'block-anchor',
      chapterIndex: 2,
      chapterKey: 'epub:item:chapter.xhtml',
      blockIndex: 5,
      blockKey: 'text:5:hash',
      kind: 'text',
      lineIndex: 1,
      textQuote: {
        exact: 'quoted text',
      },
      contentHash: 'content-hash',
    });
    expect(toReaderLocatorFromCanonicalV2(position, 3)).toMatchObject({
      chapterIndex: 2,
      blockIndex: 5,
      kind: 'text',
      pageIndex: 3,
    });
  });

  it('sanitizes V2 chapter boundary positions and exposes target accessors', () => {
    const position = sanitizeCanonicalPositionV2({
      type: 'chapter-boundary',
      chapterIndex: 4,
      chapterKey: 'txt:4:title:prefix',
      edge: 'end',
      contentVersion: 2,
    });

    expect(position).toEqual({
      type: 'chapter-boundary',
      chapterIndex: 4,
      chapterKey: 'txt:4:title:prefix',
      edge: 'end',
      contentVersion: 2,
    });
    expect(getReaderRestoreTargetBoundary({
      chapterIndex: 4,
      mode: 'scroll',
      position,
    })).toBe('end');
    expect(getReaderRestoreTargetLocator({
      chapterIndex: 4,
      mode: 'scroll',
      position,
    })).toBeUndefined();
  });

  it('keeps legacy hints while preserving projection metadata', () => {
    const canonical = {
      chapterIndex: 1,
      blockIndex: 3,
      kind: 'text' as const,
    };
    const fingerprint = createCanonicalPositionFingerprint(canonical);
    const state = buildStoredReaderState({
      canonical,
      hints: {
        chapterProgress: 0.4,
        pageIndex: 2,
        contentMode: 'paged',
        scrollProjection: {
          basisCanonicalFingerprint: fingerprint,
          capturedAt: '2026-04-24T00:00:00.000Z',
          sourceMode: 'paged',
        },
      },
      metadata: {
        capturedAt: '2026-04-24T00:00:00.000Z',
        captureQuality: 'precise',
        resolverVersion: 1,
        sourceMode: 'paged',
      },
    });

    expect(state.hints?.chapterProgress).toBe(0.4);
    expect(state.hints?.scrollProjection?.basisCanonicalFingerprint).toBe(fingerprint);
    expect(state.metadata?.captureQuality).toBe('precise');
    expect(isReaderProjectionFreshForCanonical(
      state.hints?.scrollProjection,
      canonical,
    )).toBe(true);
    expect(isReaderProjectionFreshForCanonical(
      {
        basisCanonicalFingerprint: 'stale',
      },
      canonical,
    )).toBe(false);
  });

  it('drops projection metadata when merging across chapters without overrides', () => {
    const merged = mergeStoredReaderState({
      canonical: {
        chapterIndex: 1,
        blockIndex: 3,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.4,
        scrollProjection: {
          basisCanonicalFingerprint: 'old',
        },
      },
    }, {
      canonical: {
        chapterIndex: 2,
        edge: 'start',
      },
    });

    expect(merged.hints).toBeUndefined();
  });

  it('drops projection metadata when the matching legacy projection is explicitly cleared', () => {
    const merged = mergeStoredReaderState({
      canonical: {
        chapterIndex: 1,
        blockIndex: 3,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.4,
        pageIndex: 2,
        pagedProjection: {
          basisCanonicalFingerprint: 'paged',
        },
        scrollProjection: {
          basisCanonicalFingerprint: 'scroll',
        },
      },
    }, {
      hints: {
        chapterProgress: undefined,
        pageIndex: undefined,
      },
    });

    expect(merged.hints?.chapterProgress).toBeUndefined();
    expect(merged.hints?.pageIndex).toBeUndefined();
    expect(merged.hints?.scrollProjection).toBeUndefined();
    expect(merged.hints?.pagedProjection).toBeUndefined();
  });

  it('treats explicit legacy clears as stronger than stale spread projection metadata', () => {
    const merged = mergeStoredReaderState({
      canonical: {
        chapterIndex: 1,
        blockIndex: 3,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.4,
        pageIndex: 2,
        pagedProjection: {
          basisCanonicalFingerprint: 'paged',
        },
        scrollProjection: {
          basisCanonicalFingerprint: 'scroll',
        },
      },
    }, {
      hints: {
        chapterProgress: undefined,
        pageIndex: undefined,
        pagedProjection: {
          basisCanonicalFingerprint: 'paged',
        },
        scrollProjection: {
          basisCanonicalFingerprint: 'scroll',
        },
      },
    });

    expect(merged.hints?.chapterProgress).toBeUndefined();
    expect(merged.hints?.pageIndex).toBeUndefined();
    expect(merged.hints?.scrollProjection).toBeUndefined();
    expect(merged.hints?.pagedProjection).toBeUndefined();
  });
});
