import type {
  PageTarget,
  ReaderSessionState,
  StoredReaderState,
} from '@shared/contracts/reader';

import { resolveLastContentMode } from '@shared/utils/readerMode';
import {
  buildStoredReaderState,
  clampPageIndex,
  createCanonicalPositionFingerprint,
  sanitizeGlobalFlowProjection,
  toCanonicalPositionFromLocator,
  toReaderLocatorFromCanonical,
} from '@shared/utils/readerStoredState';

import type {
  PersistedReaderProgressSnapshot,
  ReaderProgressSnapshot,
} from './contracts';

function normalizeReaderProgressSnapshot(
  snapshot: ReaderProgressSnapshot,
): ReaderProgressSnapshot {
  return {
    mode: snapshot.mode,
    activeChapterIndex: snapshot.activeChapterIndex,
    position: snapshot.position.type === 'locator'
      ? {
        type: 'locator',
        locator: {
          chapterIndex: snapshot.position.locator.chapterIndex,
          chapterKey: snapshot.position.locator.chapterKey,
          blockIndex: snapshot.position.locator.blockIndex,
          blockKey: snapshot.position.locator.blockKey,
          anchorId: snapshot.position.locator.anchorId,
          imageKey: snapshot.position.locator.imageKey,
          kind: snapshot.position.locator.kind,
          lineIndex: snapshot.position.locator.lineIndex,
          startCursor: snapshot.position.locator.startCursor
            ? { ...snapshot.position.locator.startCursor }
            : undefined,
          endCursor: snapshot.position.locator.endCursor
            ? { ...snapshot.position.locator.endCursor }
            : undefined,
          edge: snapshot.position.locator.edge,
          pageIndex: clampPageIndex(snapshot.position.locator.pageIndex),
          textQuote: snapshot.position.locator.textQuote
            ? { ...snapshot.position.locator.textQuote }
            : undefined,
          blockTextHash: snapshot.position.locator.blockTextHash,
          contentVersion: snapshot.position.locator.contentVersion,
          importFormatVersion: snapshot.position.locator.importFormatVersion,
          contentHash: snapshot.position.locator.contentHash,
        },
      }
      : {
        type: 'chapter-edge',
        chapterIndex: snapshot.position.chapterIndex,
        edge: snapshot.position.edge,
      },
    projections: {
      global: snapshot.projections?.global
        ? sanitizeGlobalFlowProjection(snapshot.projections.global)
        : undefined,
      paged: snapshot.projections?.paged?.pageIndex === undefined
        ? undefined
        : {
          pageIndex: clampPageIndex(snapshot.projections.paged.pageIndex),
          capturedAt: snapshot.projections.paged.capturedAt,
          sourceMode: snapshot.projections.paged.sourceMode,
          basisCanonicalFingerprint: snapshot.projections.paged.basisCanonicalFingerprint,
          layoutKey: snapshot.projections.paged.layoutKey,
        },
      scroll: typeof snapshot.projections?.scroll?.chapterProgress === 'number'
        ? {
          chapterProgress: snapshot.projections.scroll.chapterProgress,
          capturedAt: snapshot.projections.scroll.capturedAt,
          sourceMode: snapshot.projections.scroll.sourceMode,
          basisCanonicalFingerprint: snapshot.projections.scroll.basisCanonicalFingerprint,
        }
        : undefined,
    },
    captureQuality: snapshot.captureQuality,
    capturedAt: snapshot.capturedAt,
    sourceMode: snapshot.sourceMode,
    resolverVersion: snapshot.resolverVersion,
  };
}

function normalizeReaderProgressSnapshotForFingerprint(
  snapshot: ReaderProgressSnapshot,
): ReaderProgressSnapshot {
  const normalized = normalizeReaderProgressSnapshot(snapshot);
  return {
    ...normalized,
    capturedAt: undefined,
    projections: {
      global: normalized.projections?.global
        ? {
          ...normalized.projections.global,
          capturedAt: undefined,
        }
        : undefined,
      paged: normalized.projections?.paged
        ? {
          ...normalized.projections.paged,
          capturedAt: undefined,
        }
        : undefined,
      scroll: normalized.projections?.scroll
        ? {
          ...normalized.projections.scroll,
          capturedAt: undefined,
        }
        : undefined,
    },
  };
}

function getPositionCanonicalFingerprint(position: ReaderProgressSnapshot['position']): string {
  if (position.type === 'locator') {
    return createCanonicalPositionFingerprint(toCanonicalPositionFromLocator(position.locator));
  }

  return createCanonicalPositionFingerprint({
    chapterIndex: position.chapterIndex,
    edge: position.edge,
  });
}

export function createReaderProgressSnapshotFromSessionState(
  state: ReaderSessionState,
): ReaderProgressSnapshot {
  const mode = resolveLastContentMode(state.mode, state.lastContentMode);
  const rawLocator = state.locator
    ?? toReaderLocatorFromCanonical(state.canonical, undefined);
  const shouldStripLocatorPageIndex =
    mode === 'scroll'
    || state.positionMetadata?.sourceMode === 'scroll';
  const locator = rawLocator && shouldStripLocatorPageIndex
    ? {
      ...rawLocator,
      pageIndex: undefined,
    }
    : rawLocator;
  const chapterEdge: PageTarget = state.canonical?.edge === 'end' ? 'end' : 'start';
  const position = locator
    ? {
      type: 'locator' as const,
      locator,
    }
    : {
      type: 'chapter-edge' as const,
      chapterIndex: state.canonical?.chapterIndex ?? state.chapterIndex,
      edge: chapterEdge,
    };
  const capturedAt = state.positionMetadata?.capturedAt ?? new Date().toISOString();
  const sourceMode = state.positionMetadata?.sourceMode ?? mode;
  const basisCanonicalFingerprint = getPositionCanonicalFingerprint(position);

  return normalizeReaderProgressSnapshot({
    mode,
    activeChapterIndex: state.chapterIndex,
    position,
    projections: {
      paged: mode !== 'paged' || clampPageIndex(locator?.pageIndex) === undefined
        ? undefined
        : {
          pageIndex: clampPageIndex(locator?.pageIndex),
          capturedAt,
          sourceMode,
          basisCanonicalFingerprint,
        },
      scroll: typeof state.chapterProgress === 'number'
        ? {
          chapterProgress: state.chapterProgress,
          capturedAt,
          sourceMode,
          basisCanonicalFingerprint,
        }
        : undefined,
      global: state.globalFlow
        ? {
          globalScrollOffset: state.globalFlow.globalScrollOffset,
          globalPageIndex: state.globalFlow.globalPageIndex,
          capturedAt,
          sourceMode,
          basisCanonicalFingerprint,
          layoutKey: state.globalFlow.layoutKey,
        }
        : undefined,
    },
    captureQuality: position.type === 'locator' ? 'precise' : 'approximate',
    capturedAt,
    sourceMode,
    resolverVersion: state.positionMetadata?.resolverVersion,
  });
}

export function toStoredReaderStateFromReaderProgressSnapshot(
  snapshot: ReaderProgressSnapshot,
): StoredReaderState {
  const canonical = snapshot.position.type === 'locator'
    ? toCanonicalPositionFromLocator(snapshot.position.locator)
    : {
      chapterIndex: snapshot.position.chapterIndex,
      edge: snapshot.position.edge,
    };
  const pageIndex = snapshot.projections?.paged?.pageIndex
    ?? (snapshot.position.type === 'locator'
      ? clampPageIndex(snapshot.position.locator.pageIndex)
      : undefined);

  return buildStoredReaderState({
    canonical,
    hints: {
      chapterProgress: snapshot.projections?.scroll?.chapterProgress,
      contentMode: snapshot.mode,
      pageIndex,
      pagedProjection: snapshot.projections?.paged
        ? {
          capturedAt: snapshot.projections.paged.capturedAt,
          sourceMode: snapshot.projections.paged.sourceMode,
          basisCanonicalFingerprint: snapshot.projections.paged.basisCanonicalFingerprint,
          layoutKey: snapshot.projections.paged.layoutKey,
        }
        : undefined,
      scrollProjection: snapshot.projections?.scroll
        ? {
          capturedAt: snapshot.projections.scroll.capturedAt,
          sourceMode: snapshot.projections.scroll.sourceMode,
          basisCanonicalFingerprint: snapshot.projections.scroll.basisCanonicalFingerprint,
        }
        : undefined,
      globalFlow: snapshot.projections?.global
        ? {
          globalScrollOffset: snapshot.projections.global.globalScrollOffset,
          globalPageIndex: snapshot.projections.global.globalPageIndex,
          capturedAt: snapshot.projections.global.capturedAt,
          sourceMode: snapshot.projections.global.sourceMode,
          basisCanonicalFingerprint: snapshot.projections.global.basisCanonicalFingerprint,
          layoutKey: snapshot.projections.global.layoutKey,
        }
        : undefined,
      viewMode: 'original',
    },
    metadata: {
      capturedAt: snapshot.capturedAt,
      captureQuality: snapshot.captureQuality,
      resolverVersion: snapshot.resolverVersion,
      sourceMode: snapshot.sourceMode,
    },
  });
}

export function toStoredReaderStateFromPersistedReaderProgress(
  progress: PersistedReaderProgressSnapshot,
): StoredReaderState {
  return toStoredReaderStateFromReaderProgressSnapshot(progress.snapshot);
}

export function getReaderProgressSnapshotFingerprint(
  state: ReaderSessionState | ReaderProgressSnapshot | PersistedReaderProgressSnapshot | null,
): string {
  if (!state) {
    return 'null';
  }

  let snapshot: ReaderProgressSnapshot;
  if ('snapshot' in state) {
    snapshot = state.snapshot;
  } else if ('mode' in state && 'activeChapterIndex' in state) {
    snapshot = state;
  } else {
    snapshot = createReaderProgressSnapshotFromSessionState(state);
  }

  return JSON.stringify(normalizeReaderProgressSnapshotForFingerprint(snapshot));
}
