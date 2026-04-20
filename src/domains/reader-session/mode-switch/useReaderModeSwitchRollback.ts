import { useCallback, useRef } from 'react';
import type {
  ReaderMode,
  ReaderRestoreTarget,
  RestoreSettledResult,
  StoredReaderState,
} from '@shared/contracts/reader';
import type { ReaderSessionCommands } from '@shared/contracts/reader';
import { buildStoredReaderState } from '@shared/utils/readerStoredState';
import { debugLog, setDebugSnapshot } from '@shared/debug';
import { isReaderTraceEnabled, recordReaderTrace } from '@shared/reader-trace';

interface ModeSwitchRollbackSnapshot {
  previousChapterIndex: number;
  previousMode: ReaderMode;
  previousRestoreTarget: ReaderRestoreTarget;
  previousState: StoredReaderState;
  rollbackPending: boolean;
}

interface UseReaderModeSwitchRollbackParams {
  persistReaderState: ReaderSessionCommands['persistReaderState'];
  rememberModeState: (target: ReaderRestoreTarget) => void;
  setMode: ReaderSessionCommands['setMode'];
  setPendingRestoreTarget: (
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => void;
  suppressScrollSyncTemporarily: () => void;
}

function cloneReaderRestoreTarget(target: ReaderRestoreTarget): ReaderRestoreTarget {
  return {
    ...target,
    locator: target.locator
      ? {
        ...target.locator,
        startCursor: target.locator.startCursor
          ? { ...target.locator.startCursor }
          : undefined,
        endCursor: target.locator.endCursor
          ? { ...target.locator.endCursor }
          : undefined,
      }
      : undefined,
  };
}

export function useReaderModeSwitchRollback({
  persistReaderState,
  rememberModeState,
  setMode,
  setPendingRestoreTarget,
  suppressScrollSyncTemporarily,
}: UseReaderModeSwitchRollbackParams) {
  const rollbackRef = useRef<ModeSwitchRollbackSnapshot | null>(null);

  const rememberModeSwitchSource = useCallback((params: {
    previousMode: ReaderMode;
    previousRestoreTarget: ReaderRestoreTarget;
    previousState: StoredReaderState;
  }) => {
    rollbackRef.current = {
      previousChapterIndex: params.previousRestoreTarget.chapterIndex,
      previousMode: params.previousMode,
      previousRestoreTarget: cloneReaderRestoreTarget(params.previousRestoreTarget),
      previousState: buildStoredReaderState(params.previousState),
      rollbackPending: false,
    };
  }, []);

  const handleRestoreSettled = useCallback((
    result: RestoreSettledResult,
    failedMode: ReaderMode,
  ): boolean => {
    const rollbackSnapshot = rollbackRef.current;
    if (!rollbackSnapshot) {
      return false;
    }

    if (result === 'completed' || result === 'skipped') {
      rollbackRef.current = null;
      return false;
    }

    if (rollbackSnapshot.rollbackPending) {
      rollbackRef.current = null;
      return false;
    }

    rollbackRef.current = {
      ...rollbackSnapshot,
      rollbackPending: true,
    };
    if (isReaderTraceEnabled()) {
      recordReaderTrace('mode_switch_rollback', {
        chapterIndex: rollbackSnapshot.previousChapterIndex,
        mode: rollbackSnapshot.previousMode,
        details: {
          failedMode,
          hasLocator: Boolean(rollbackSnapshot.previousRestoreTarget.locator),
          locatorBoundary: rollbackSnapshot.previousRestoreTarget.locatorBoundary ?? null,
          rollbackMode: rollbackSnapshot.previousMode,
        },
      });
    }
    suppressScrollSyncTemporarily();
    rememberModeState(rollbackSnapshot.previousRestoreTarget);
    setPendingRestoreTarget(rollbackSnapshot.previousRestoreTarget, { force: true });
    setMode(rollbackSnapshot.previousMode);
    persistReaderState(rollbackSnapshot.previousState, { flush: true });
    setDebugSnapshot('reader-mode-switch-rollback', {
      source: 'useReaderModeSwitchRollback.handleRestoreSettled',
      failedMode,
      rollbackMode: rollbackSnapshot.previousMode,
      chapterIndex: rollbackSnapshot.previousChapterIndex,
      hasLocator: Boolean(rollbackSnapshot.previousRestoreTarget.locator),
      locatorBoundary: rollbackSnapshot.previousRestoreTarget.locatorBoundary ?? null,
      chapterProgress: rollbackSnapshot.previousRestoreTarget.chapterProgress ?? null,
    });
    debugLog('Reader', 'reader mode switch restore failed; rolling back to previous mode', {
      source: 'useReaderModeSwitchRollback.handleRestoreSettled',
      failedMode,
      rollbackMode: rollbackSnapshot.previousMode,
      chapterIndex: rollbackSnapshot.previousChapterIndex,
    });
    return true;
  }, [
    persistReaderState,
    rememberModeState,
    setMode,
    setPendingRestoreTarget,
    suppressScrollSyncTemporarily,
  ]);

  return {
    rememberModeSwitchSource,
    handleRestoreSettled,
  };
}
