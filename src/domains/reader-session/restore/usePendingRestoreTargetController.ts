import { useCallback, useEffect, useRef } from 'react';

import type { ReaderRestoreTarget } from '@shared/contracts/reader';
import type { ReaderPersistenceRuntimeValue } from '@shared/contracts/reader';

import { beginRestore, completeRestore, setPendingRestoreTarget } from '../store/readerSessionStore';
import { isReaderTraceEnabled, recordReaderTrace } from '@shared/reader-trace';
import { shouldKeepReaderRestoreMask } from '@shared/utils/readerPosition';

export function usePendingRestoreTargetController(params: {
  pendingRestoreTarget: ReaderRestoreTarget | null;
  persistence: Pick<ReaderPersistenceRuntimeValue, 'suppressScrollSyncTemporarily'>;
}) {
  const pendingRestoreTargetRef = useRef<ReaderRestoreTarget | null>(params.pendingRestoreTarget);
  const pendingRestoreTargetOverrideRef = useRef<ReaderRestoreTarget | null>(null);

  useEffect(() => {
    const nextPendingRestoreTarget = params.pendingRestoreTarget;
    const pendingOverrideTarget = pendingRestoreTargetOverrideRef.current;

    if (pendingOverrideTarget) {
      if (nextPendingRestoreTarget === null) {
        return;
      }
      pendingRestoreTargetOverrideRef.current = null;
    }

    pendingRestoreTargetRef.current = nextPendingRestoreTarget;
  }, [params.pendingRestoreTarget]);

  const updatePendingRestoreTarget = useCallback((
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => {
    if (!nextTarget) {
      if (isReaderTraceEnabled()) {
        recordReaderTrace('restore_target_cleared', {
          details: {
            source: 'usePendingRestoreTargetController.setPendingRestoreTarget',
          },
        });
      }
      pendingRestoreTargetOverrideRef.current = null;
      pendingRestoreTargetRef.current = null;
      setPendingRestoreTarget(null);
      return;
    }

    if (options?.force) {
      if (isReaderTraceEnabled()) {
        recordReaderTrace('restore_target_set', {
          chapterIndex: nextTarget.chapterIndex,
          mode: nextTarget.mode,
          details: {
            chapterProgress: nextTarget.chapterProgress ?? null,
            force: true,
            hasLocator: Boolean(nextTarget.locator),
            locatorBoundary: nextTarget.locatorBoundary ?? null,
          },
        });
      }
      pendingRestoreTargetOverrideRef.current = nextTarget;
      pendingRestoreTargetRef.current = nextTarget;
      setPendingRestoreTarget(nextTarget);
      return;
    }

    const maskedTarget = shouldKeepReaderRestoreMask(nextTarget) ? nextTarget : null;
    if (isReaderTraceEnabled()) {
      recordReaderTrace(maskedTarget ? 'restore_target_set' : 'restore_target_cleared', {
        chapterIndex: nextTarget.chapterIndex,
        mode: nextTarget.mode,
        details: {
          chapterProgress: nextTarget.chapterProgress ?? null,
          force: false,
          hasLocator: Boolean(nextTarget.locator),
          locatorBoundary: nextTarget.locatorBoundary ?? null,
          maskedOut: !maskedTarget,
        },
      });
    }
    pendingRestoreTargetOverrideRef.current = null;
    pendingRestoreTargetRef.current = maskedTarget;
    setPendingRestoreTarget(maskedTarget);
  }, []);

  const clearPendingRestoreTarget = useCallback(() => {
    if (isReaderTraceEnabled()) {
      recordReaderTrace('restore_target_cleared', {
        details: {
          source: 'usePendingRestoreTargetController.clearPendingRestoreTarget',
        },
      });
    }
    pendingRestoreTargetOverrideRef.current = null;
    pendingRestoreTargetRef.current = null;
    setPendingRestoreTarget(null);
  }, []);

  const startRestoreMaskForTarget = useCallback(
    (target: ReaderRestoreTarget | null | undefined) => {
      if (shouldKeepReaderRestoreMask(target)) {
        beginRestore(target);
        return;
      }
      completeRestore();
    },
    [],
  );

  const stopRestoreMask = useCallback(() => {
    completeRestore();
  }, []);

  const suppressScrollSyncTemporarily = useCallback(() => {
    params.persistence.suppressScrollSyncTemporarily();
  }, [params.persistence]);

  return {
    clearPendingRestoreTarget,
    pendingRestoreTargetRef,
    setPendingRestoreTarget: updatePendingRestoreTarget,
    startRestoreMaskForTarget,
    stopRestoreMask,
    suppressScrollSyncTemporarily,
  };
}
