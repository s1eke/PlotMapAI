import { useCallback, useEffect, useRef } from 'react';

import type { ReaderRestoreTarget } from '@shared/contracts/reader';
import type { ReaderPersistenceRuntimeValue } from '@shared/contracts/reader';

import { beginRestore, completeRestore, setPendingRestoreTarget } from './readerSessionStore';
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
      pendingRestoreTargetOverrideRef.current = null;
      pendingRestoreTargetRef.current = null;
      setPendingRestoreTarget(null);
      return;
    }

    if (options?.force) {
      pendingRestoreTargetOverrideRef.current = nextTarget;
      pendingRestoreTargetRef.current = nextTarget;
      setPendingRestoreTarget(nextTarget);
      return;
    }

    const maskedTarget = shouldKeepReaderRestoreMask(nextTarget) ? nextTarget : null;
    pendingRestoreTargetOverrideRef.current = null;
    pendingRestoreTargetRef.current = maskedTarget;
    setPendingRestoreTarget(maskedTarget);
  }, []);

  const clearPendingRestoreTarget = useCallback(() => {
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
