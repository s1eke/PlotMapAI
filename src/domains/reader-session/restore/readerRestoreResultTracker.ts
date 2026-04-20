import { useCallback, useRef } from 'react';

import type { ReaderRestoreResult, ReaderRestoreTarget } from '@shared/contracts/reader';

import { setDebugSnapshot } from '@shared/debug';

import { setLastRestoreResult } from '../store/readerSessionStore';

const MAX_AUTO_RESTORE_RETRIES = 2;

function cloneRestoreTarget(target: ReaderRestoreTarget): ReaderRestoreTarget {
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

function buildRestoreAttemptKey(target: ReaderRestoreTarget): string {
  const { locator } = target;
  const locatorKey = locator
    ? [
      locator.chapterIndex,
      locator.blockIndex,
      locator.kind,
      locator.lineIndex ?? '',
      locator.pageIndex ?? '',
      locator.edge ?? '',
    ].join(':')
    : '';

  return [
    target.mode,
    target.chapterIndex,
    target.locatorBoundary ?? '',
    target.chapterProgress ?? '',
    locatorKey,
  ].join('|');
}

export interface RestoreResultRecordOutcome {
  scheduledRetry: boolean;
}

export interface UseReaderRestoreResultTrackerParams {
  shouldScheduleRetry?: (
    target: ReaderRestoreTarget | null | undefined,
    result: ReaderRestoreResult,
  ) => boolean;
  setPendingRestoreTarget: (
    nextTarget: ReaderRestoreTarget | null,
    options?: { force?: boolean },
  ) => void;
  startRestoreMaskForTarget: (
    target: ReaderRestoreTarget | null | undefined,
  ) => void;
}

export interface UseReaderRestoreResultTrackerResult {
  getRestoreAttempt: (target: ReaderRestoreTarget | null | undefined) => number;
  recordRestoreResult: (
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ) => RestoreResultRecordOutcome;
  retryLastFailedRestore: () => boolean;
}

export function useReaderRestoreResultTracker(
  params: UseReaderRestoreResultTrackerParams,
): UseReaderRestoreResultTrackerResult {
  const {
    setPendingRestoreTarget,
    shouldScheduleRetry,
    startRestoreMaskForTarget,
  } = params;
  const restoreAttemptByTargetKeyRef = useRef<Map<string, number>>(new Map());
  const lastFailedRestoreTargetRef = useRef<ReaderRestoreTarget | null>(null);

  const getRestoreAttempt = useCallback((target: ReaderRestoreTarget | null | undefined) => {
    if (!target) {
      return 0;
    }

    return restoreAttemptByTargetKeyRef.current.get(buildRestoreAttemptKey(target)) ?? 0;
  }, []);

  const recordRestoreResult = useCallback((
    result: ReaderRestoreResult,
    target: ReaderRestoreTarget | null | undefined,
  ): RestoreResultRecordOutcome => {
    setLastRestoreResult(result);
    setDebugSnapshot('reader-restore', {
      ...result,
      target,
    });

    if (!target) {
      return { scheduledRetry: false };
    }

    const key = buildRestoreAttemptKey(target);
    if (result.status === 'completed' || result.status === 'skipped') {
      restoreAttemptByTargetKeyRef.current.delete(key);
      if (
        lastFailedRestoreTargetRef.current
        && buildRestoreAttemptKey(lastFailedRestoreTargetRef.current) === key
      ) {
        lastFailedRestoreTargetRef.current = null;
      }
      return { scheduledRetry: false };
    }

    const attemptIndex = Math.max(result.attempts - 1, 0);
    const canScheduleRetry = shouldScheduleRetry
      ? shouldScheduleRetry(target, result)
      : true;
    if (result.retryable && canScheduleRetry && attemptIndex < MAX_AUTO_RESTORE_RETRIES) {
      const nextAttempt = attemptIndex + 1;
      restoreAttemptByTargetKeyRef.current.set(key, nextAttempt);
      const retryTarget = cloneRestoreTarget(target);
      setPendingRestoreTarget(retryTarget, { force: true });
      startRestoreMaskForTarget(retryTarget);
      return { scheduledRetry: true };
    }

    restoreAttemptByTargetKeyRef.current.delete(key);
    lastFailedRestoreTargetRef.current = cloneRestoreTarget(target);
    return { scheduledRetry: false };
  }, [setPendingRestoreTarget, shouldScheduleRetry, startRestoreMaskForTarget]);

  const retryLastFailedRestore = useCallback((): boolean => {
    const failedTarget = lastFailedRestoreTargetRef.current;
    if (!failedTarget) {
      return false;
    }

    const retryTarget = cloneRestoreTarget(failedTarget);
    lastFailedRestoreTargetRef.current = null;
    restoreAttemptByTargetKeyRef.current.set(buildRestoreAttemptKey(retryTarget), 0);
    setPendingRestoreTarget(retryTarget, { force: true });
    startRestoreMaskForTarget(retryTarget);
    setLastRestoreResult(null);
    setDebugSnapshot('reader-restore', {
      action: 'manual-retry',
      target: retryTarget,
      time: Date.now(),
    });
    return true;
  }, [setPendingRestoreTarget, startRestoreMaskForTarget]);

  return {
    getRestoreAttempt,
    recordRestoreResult,
    retryLastFailedRestore,
  };
}
