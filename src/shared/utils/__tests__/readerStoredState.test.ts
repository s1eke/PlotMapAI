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
import { createRestoreTargetFromPersistedState } from '../readerPosition';

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

  it('converts runtime canonical positions into CanonicalPositionV2', () => {
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

  it('does not accept retired untyped V1 shapes as CanonicalPositionV2 input', () => {
    expect(sanitizeCanonicalPositionV2({
      chapterIndex: 2,
      blockIndex: 5,
      kind: 'text',
    })).toBeUndefined();
  });

  it('ignores retired top-level stored-state fallback fields', () => {
    const state = buildStoredReaderState({
      chapterIndex: 7,
      locator: {
        chapterIndex: 6,
        blockIndex: 2,
        kind: 'text',
      },
      pageIndex: 3,
      mode: 'paged',
    } as unknown as Parameters<typeof buildStoredReaderState>[0]);

    expect(state).toEqual({
      canonical: {
        chapterIndex: 0,
        edge: 'start',
      },
      hints: undefined,
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

  it('sanitizes global flow projections and carries them into restore targets', () => {
    const canonical = {
      chapterIndex: 1,
      blockIndex: 3,
      kind: 'text' as const,
    };
    const fingerprint = createCanonicalPositionFingerprint(canonical);
    const state = buildStoredReaderState({
      canonical,
      hints: {
        contentMode: 'scroll',
        globalFlow: {
          basisCanonicalFingerprint: fingerprint,
          capturedAt: '2026-04-24T00:00:00.000Z',
          globalPageIndex: 12.8,
          globalScrollOffset: 2048.5,
          layoutKey: 'layout-a',
          sourceMode: 'scroll',
        },
      },
    });
    const target = createRestoreTargetFromPersistedState(state, 'scroll');

    expect(state.hints?.globalFlow).toEqual({
      basisCanonicalFingerprint: fingerprint,
      capturedAt: '2026-04-24T00:00:00.000Z',
      globalPageIndex: 12,
      globalScrollOffset: 2048.5,
      layoutKey: 'layout-a',
      sourceMode: 'scroll',
    });
    expect(target?.globalFlow).toEqual(state.hints?.globalFlow);
  });

  it('keeps scroll chapter progress for scroll-mode restore targets when projection metadata is stale', () => {
    const state = buildStoredReaderState({
      canonical: {
        chapterIndex: 1,
        blockIndex: 6,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.27,
        contentMode: 'scroll',
        scrollProjection: {
          basisCanonicalFingerprint: 'stale',
          sourceMode: 'scroll',
        },
      },
    });

    const target = createRestoreTargetFromPersistedState(state, 'scroll');

    expect(target?.chapterProgress).toBe(0.27);
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

  it('clears global flow when the matching projection coordinate is cleared', () => {
    const merged = mergeStoredReaderState({
      canonical: {
        chapterIndex: 1,
        blockIndex: 3,
        kind: 'text',
      },
      hints: {
        chapterProgress: 0.4,
        globalFlow: {
          globalScrollOffset: 512,
          layoutKey: 'layout-a',
          sourceMode: 'scroll',
        },
      },
    }, {
      hints: {
        chapterProgress: undefined,
      },
    });

    expect(merged.hints?.chapterProgress).toBeUndefined();
    expect(merged.hints?.globalFlow).toBeUndefined();
  });
});
