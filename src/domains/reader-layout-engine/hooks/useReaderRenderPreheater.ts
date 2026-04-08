import type { MutableRefObject } from 'react';
import type { ChapterContent } from '@shared/contracts/reader';
import type {
  ReaderLayoutSignature,
  ReaderRenderVariant,
  ReaderTypographyMetrics,
} from '../layout-core/internal';
import type { ReaderRenderPreheatTarget } from '../utils/readerRenderCachePlanning';
import type {
  ReaderRenderPreheaterResult,
  UseReaderRenderCacheParams,
} from './readerRenderCacheTypes';

import { useEffect, useRef, useState } from 'react';
import { debugLog } from '@shared/debug';
import { useReaderContentRuntime } from '@shared/reader-runtime';

import {
  createChapterContentHash,
  serializeReaderLayoutSignature,
} from '../layout-core/internal';
import {
  buildStaticRenderManifest,
  buildStaticRenderTree,
  getReaderRenderCacheEntryFromMemory,
  getReaderRenderCacheRecordFromDexie,
  isMaterializedReaderRenderCacheEntry,
  persistReaderRenderCacheEntry,
  primeReaderRenderCacheEntry,
  READER_RENDERER_VERSION,
  resolveReaderLayoutFeatureSet,
  warmReaderRenderImages,
} from '../utils/readerRenderCache';
import {
  buildChapterImageDimensionsMap,
  buildChapterImageLayoutKey,
} from '../utils/readerRenderCachePlanning';

interface UseReaderRenderPreheaterParams {
  currentChapterIndex: number | null;
  fetchChapterContent: UseReaderRenderCacheParams['fetchChapterContent'];
  loadedChaptersRef: MutableRefObject<Map<number, ChapterContent>>;
  novelId: number;
  onMaterializedEntry: (entry: {
    chapterIndex: number;
    variantFamily: ReaderRenderVariant;
  }) => void;
  preheatTargets: ReaderRenderPreheatTarget[];
  preferRichScrollRendering: boolean;
  readerTelemetryEnabled: boolean;
  typography: ReaderTypographyMetrics;
  variantSignatures: Record<ReaderRenderVariant, ReaderLayoutSignature>;
}

function scheduleIdleTask(callback: () => void): number {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(() => {
      callback();
    });
  }

  return window.setTimeout(callback, 16);
}

function cancelIdleTask(handle: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
}

export function useReaderRenderPreheater({
  currentChapterIndex,
  fetchChapterContent,
  loadedChaptersRef,
  novelId,
  onMaterializedEntry,
  preheatTargets,
  preferRichScrollRendering,
  readerTelemetryEnabled,
  typography,
  variantSignatures,
}: UseReaderRenderPreheaterParams): ReaderRenderPreheaterResult {
  const readerContentRuntime = useReaderContentRuntime();
  const [pendingPreheatCount, setPendingPreheatCount] = useState(0);
  const [isPreheating, setIsPreheating] = useState(false);
  const fetchChapterContentRef = useRef(fetchChapterContent);
  const onMaterializedEntryRef = useRef(onMaterializedEntry);
  const readerTelemetryEnabledRef = useRef(readerTelemetryEnabled);

  useEffect(() => {
    fetchChapterContentRef.current = fetchChapterContent;
  }, [fetchChapterContent]);

  useEffect(() => {
    onMaterializedEntryRef.current = onMaterializedEntry;
  }, [onMaterializedEntry]);

  useEffect(() => {
    readerTelemetryEnabledRef.current = readerTelemetryEnabled;
  }, [readerTelemetryEnabled]);

  useEffect(() => {
    if (!novelId || currentChapterIndex === null || preheatTargets.length === 0) {
      setIsPreheating((previousState) => (previousState ? false : previousState));
      setPendingPreheatCount((previousCount) => (previousCount === 0 ? previousCount : 0));
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    const controllers = new Set<AbortController>();
    const queue = [...preheatTargets];

    setIsPreheating((previousState) => (
      previousState === (queue.length > 0) ? previousState : queue.length > 0
    ));
    setPendingPreheatCount((previousCount) => (
      previousCount === queue.length ? previousCount : queue.length
    ));

    const runNext = () => {
      if (cancelled) {
        return;
      }

      const nextTarget = queue.shift();
      setPendingPreheatCount((previousCount) => (
        previousCount === queue.length ? previousCount : queue.length
      ));

      if (!nextTarget) {
        setIsPreheating((previousState) => (previousState ? false : previousState));
        return;
      }

      async function runPreheatTask(target: ReaderRenderPreheatTarget): Promise<void> {
        try {
          let chapter = loadedChaptersRef.current.get(target.chapterIndex) ?? null;
          const signature = variantSignatures[target.variantFamily];

          if (!chapter) {
            const controller = new AbortController();
            controllers.add(controller);

            try {
              chapter = await fetchChapterContentRef.current(target.chapterIndex, {
                signal: controller.signal,
              });

              if (!cancelled) {
                loadedChaptersRef.current.set(chapter.index, chapter);
              }
            } catch {
              chapter = null;
            } finally {
              controllers.delete(controller);
            }
          }

          if (!chapter || cancelled) {
            return;
          }

          const contentHash = createChapterContentHash(chapter);
          const layoutFeatureSet = resolveReaderLayoutFeatureSet({
            chapter,
            preferRichScrollRendering,
            variantFamily: target.variantFamily,
          });
          const layoutKey = buildChapterImageLayoutKey(
            novelId,
            chapter,
            serializeReaderLayoutSignature(signature),
          );

          const lookup = {
            chapterIndex: chapter.index,
            contentHash,
            contentFormat: chapter.contentFormat,
            contentVersion: chapter.contentVersion,
            layoutFeatureSet,
            layoutKey,
            novelId,
            rendererVersion: READER_RENDERER_VERSION,
            variantFamily: target.variantFamily,
          } as const;

          if (getReaderRenderCacheEntryFromMemory(lookup)) {
            if (readerTelemetryEnabledRef.current) {
              debugLog('READER', 'Reader preheat source', {
                chapterIndex: chapter.index,
                source: 'memory',
                storageKind: 'render-tree',
                variantFamily: target.variantFamily,
              });
            }
            return;
          }

          const dexieRecord = await getReaderRenderCacheRecordFromDexie(lookup);
          if (dexieRecord && (
            target.storageKind === 'manifest'
            || dexieRecord.storageKind === 'render-tree'
          )) {
            if (readerTelemetryEnabledRef.current) {
              debugLog('READER', 'Reader preheat source', {
                chapterIndex: chapter.index,
                source: 'dexie',
                storageKind: dexieRecord.storageKind,
                variantFamily: target.variantFamily,
              });
            }

            if (target.storageKind === 'render-tree' && isMaterializedReaderRenderCacheEntry(dexieRecord)) {
              primeReaderRenderCacheEntry(dexieRecord);
            }

            if (
              !cancelled
              && target.storageKind === 'render-tree'
              && isMaterializedReaderRenderCacheEntry(dexieRecord)
            ) {
              onMaterializedEntryRef.current({
                chapterIndex: chapter.index,
                variantFamily: target.variantFamily,
              });
            }

            return;
          }

          if (target.storageKind === 'manifest') {
            const manifestEntry = buildStaticRenderManifest({
              chapter,
              imageDimensionsByKey: buildChapterImageDimensionsMap(novelId, chapter),
              layoutKey,
              layoutSignature: signature,
              novelId,
              preferRichScrollRendering,
              typography,
              variantFamily: target.variantFamily,
            });

            if (readerTelemetryEnabledRef.current) {
              debugLog('READER', 'Reader preheat source', {
                chapterIndex: chapter.index,
                source: 'built',
                storageKind: manifestEntry.storageKind,
                variantFamily: target.variantFamily,
              });
            }

            await persistReaderRenderCacheEntry(manifestEntry);
            return;
          }

          if (target.variantFamily !== 'summary-shell') {
            await warmReaderRenderImages(readerContentRuntime, novelId, chapter);
          }

          const builtEntry = buildStaticRenderTree({
            chapter,
            imageDimensionsByKey: buildChapterImageDimensionsMap(novelId, chapter),
            layoutKey,
            layoutSignature: signature,
            novelId,
            preferRichScrollRendering,
            typography,
            variantFamily: target.variantFamily,
          });

          if (readerTelemetryEnabledRef.current) {
            debugLog('READER', 'Reader preheat source', {
              chapterIndex: chapter.index,
              source: 'built',
              storageKind: builtEntry.storageKind,
              variantFamily: target.variantFamily,
            });
          }

          primeReaderRenderCacheEntry(builtEntry);
          await persistReaderRenderCacheEntry(builtEntry);

          if (!cancelled) {
            onMaterializedEntryRef.current({
              chapterIndex: chapter.index,
              variantFamily: target.variantFamily,
            });
          }
        } catch (error) {
          debugLog('READER', 'Reader render preheat failed', {
            chapterIndex: target.chapterIndex,
            variantFamily: target.variantFamily,
          }, error);
        } finally {
          if (!cancelled) {
            idleHandle = scheduleIdleTask(runNext);
          }
        }
      }

      runPreheatTask(nextTarget).catch((error) => {
        debugLog('READER', 'Reader render preheat scheduling failed', {
          chapterIndex: nextTarget.chapterIndex,
          variantFamily: nextTarget.variantFamily,
        }, error);
      });
    };

    idleHandle = scheduleIdleTask(runNext);

    return () => {
      cancelled = true;

      if (idleHandle !== null) {
        cancelIdleTask(idleHandle);
      }

      for (const controller of controllers) {
        controller.abort();
      }
    };
  }, [
    currentChapterIndex,
    loadedChaptersRef,
    novelId,
    preheatTargets,
    preferRichScrollRendering,
    readerContentRuntime,
    typography,
    variantSignatures,
  ]);

  return {
    isPreheating,
    pendingPreheatCount,
  };
}
