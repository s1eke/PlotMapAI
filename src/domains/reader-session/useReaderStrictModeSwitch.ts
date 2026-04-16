import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ReaderMode,
  ReaderPersistenceFailure,
  ReaderRestoreResult,
  ReaderRestoreTarget,
  RestoreSettledResult,
} from '@shared/contracts/reader';
import type { AppError } from '@shared/errors';

import { AppErrorCode, createAppError } from '@shared/errors';
import {
  debugFeatureSubscribe,
  debugLog,
  getDebugFeatureFlags,
  setDebugSnapshot,
} from '@shared/debug';

import * as readerSessionStore from './readerSessionStore';

export type StrictModeSwitchContentMode = Exclude<ReaderMode, 'summary'>;
export type ModeSwitchTransactionStage = 'capture_source' | 'persist_target_state' | 'restore_target';

export interface ModeSwitchTransaction {
  chapterIndex: number;
  sourceMode: StrictModeSwitchContentMode;
  stage: ModeSwitchTransactionStage;
  strict: boolean;
  targetMode: StrictModeSwitchContentMode;
  targetRestoreTarget: ReaderRestoreTarget;
}

interface StrictModeSwitchFailureParams {
  chapterIndex: number;
  message: string;
  restoreResult?: ReaderRestoreResult | null;
  sourceMode: StrictModeSwitchContentMode;
  stage: ModeSwitchTransactionStage;
  targetMode: StrictModeSwitchContentMode;
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

function areReaderRestoreTargetsEqual(
  left: ReaderRestoreTarget | null | undefined,
  right: ReaderRestoreTarget | null | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.chapterIndex === right.chapterIndex
    && left.mode === right.mode
    && left.locatorBoundary === right.locatorBoundary
    && left.chapterProgress === right.chapterProgress
    && left.locator?.chapterIndex === right.locator?.chapterIndex
    && left.locator?.blockIndex === right.locator?.blockIndex
    && left.locator?.kind === right.locator?.kind
    && left.locator?.lineIndex === right.locator?.lineIndex
    && left.locator?.pageIndex === right.locator?.pageIndex
    && left.locator?.edge === right.locator?.edge
    && left.locator?.startCursor?.segmentIndex === right.locator?.startCursor?.segmentIndex
    && left.locator?.startCursor?.graphemeIndex === right.locator?.startCursor?.graphemeIndex
    && left.locator?.endCursor?.segmentIndex === right.locator?.endCursor?.segmentIndex
    && left.locator?.endCursor?.graphemeIndex === right.locator?.endCursor?.graphemeIndex;
}

function formatMeasuredError(result: ReaderRestoreResult | null | undefined): string | null {
  const measuredError = result?.measuredError;
  if (!measuredError) {
    return null;
  }

  return `${measuredError.metric} delta=${measuredError.delta} tolerance=${measuredError.tolerance}`;
}

function buildModeSwitchFailureMessage(params: StrictModeSwitchFailureParams): string {
  const restoreReason = params.restoreResult?.reason
    ? ` reason=${params.restoreResult.reason}`
    : '';
  const measuredError = formatMeasuredError(params.restoreResult);
  const measuredErrorLabel = measuredError ? ` ${measuredError}` : '';

  return [
    `stage=${params.stage}`,
    `switch=${params.sourceMode}->${params.targetMode}`,
    `chapter=${params.chapterIndex}`,
    `message=${params.message}`,
  ].join(' ')
    + restoreReason
    + measuredErrorLabel;
}

export interface UseReaderStrictModeSwitchResult {
  clearModeSwitchError: () => void;
  clearStrictModeSwitchTransaction: () => void;
  finalizeStrictModeSwitchFailure: (params: StrictModeSwitchFailureParams) => AppError;
  flushPersistenceForStrictMode: () => Promise<ReaderPersistenceFailure | null>;
  handleStrictModeRestoreSettled: (result: RestoreSettledResult) => boolean;
  modeSwitchError: AppError | null;
  setStrictModeSwitchTransaction: (transaction: ModeSwitchTransaction) => void;
  shouldScheduleRestoreRetry: (target: ReaderRestoreTarget | null | undefined) => boolean;
  strictModeSwitchEnabled: boolean;
}

export function useReaderStrictModeSwitch(): UseReaderStrictModeSwitchResult {
  const [modeSwitchError, setModeSwitchError] = useState<AppError | null>(null);
  const [strictModeSwitchEnabled, setStrictModeSwitchEnabled] = useState(
    () => getDebugFeatureFlags().readerStrictModeSwitch,
  );
  const modeSwitchTransactionRef = useRef<ModeSwitchTransaction | null>(null);

  useEffect(() => {
    return debugFeatureSubscribe((featureFlags) => {
      setStrictModeSwitchEnabled(featureFlags.readerStrictModeSwitch);
    });
  }, []);

  const clearModeSwitchError = useCallback(() => {
    setModeSwitchError(null);
  }, []);

  const clearStrictModeSwitchTransaction = useCallback(() => {
    modeSwitchTransactionRef.current = null;
  }, []);

  const setStrictModeSwitchTransaction = useCallback((transaction: ModeSwitchTransaction) => {
    modeSwitchTransactionRef.current = {
      ...transaction,
      targetRestoreTarget: cloneReaderRestoreTarget(transaction.targetRestoreTarget),
    };
  }, []);

  const flushPersistenceForStrictMode = useCallback(async () => {
    const previousFailure = readerSessionStore.getReaderSessionSnapshot().lastPersistenceFailure;
    await readerSessionStore.flushPersistence();
    const nextSnapshot = readerSessionStore.getReaderSessionSnapshot();
    const nextFailure = nextSnapshot.lastPersistenceFailure;
    const hasNewFailure =
      nextSnapshot.persistenceStatus === 'degraded'
      && Boolean(nextFailure)
      && (
        nextFailure?.time !== previousFailure?.time
        || nextFailure?.message !== previousFailure?.message
        || nextFailure?.code !== previousFailure?.code
      );

    return hasNewFailure ? nextFailure ?? null : null;
  }, []);

  const finalizeStrictModeSwitchFailure = useCallback((params: StrictModeSwitchFailureParams) => {
    const errorMessage = buildModeSwitchFailureMessage(params);
    const error = createAppError({
      code: AppErrorCode.READER_MODE_SWITCH_FAILED,
      kind: params.stage === 'restore_target' ? 'execution' : 'storage',
      source: 'reader',
      retryable: false,
      userVisible: true,
      debugVisible: true,
      userMessageParams: {
        message: errorMessage,
      },
      debugMessage: errorMessage,
      details: {
        chapterIndex: params.chapterIndex,
        restoreResult: params.restoreResult ?? undefined,
        sourceMode: params.sourceMode,
        stage: params.stage,
        targetMode: params.targetMode,
      },
    });
    setModeSwitchError(error);
    setDebugSnapshot('reader-mode-switch', {
      chapterIndex: params.chapterIndex,
      errorMessage,
      reason: params.restoreResult?.reason ?? null,
      source: 'useReaderStrictModeSwitch.finalizeStrictModeSwitchFailure',
      sourceMode: params.sourceMode,
      stage: params.stage,
      status: 'failed',
      strictModeSwitchEnabled: true,
      targetMode: params.targetMode,
    });
    debugLog('Reader', 'reader strict mode switch failed', {
      chapterIndex: params.chapterIndex,
      errorMessage,
      reason: params.restoreResult?.reason ?? null,
      sourceMode: params.sourceMode,
      stage: params.stage,
      targetMode: params.targetMode,
    });
    clearStrictModeSwitchTransaction();
    return error;
  }, [clearStrictModeSwitchTransaction]);

  const handleStrictModeRestoreSettled = useCallback((result: RestoreSettledResult): boolean => {
    const transaction = modeSwitchTransactionRef.current;
    if (!transaction?.strict || transaction.stage !== 'restore_target') {
      return false;
    }

    if (result === 'failed') {
      const { lastRestoreResult } = readerSessionStore.getReaderSessionSnapshot();
      finalizeStrictModeSwitchFailure({
        chapterIndex: transaction.chapterIndex,
        message: lastRestoreResult?.reason ?? 'restore failed',
        restoreResult: lastRestoreResult,
        sourceMode: transaction.sourceMode,
        stage: 'restore_target',
        targetMode: transaction.targetMode,
      });
      return true;
    }

    clearStrictModeSwitchTransaction();
    return true;
  }, [clearStrictModeSwitchTransaction, finalizeStrictModeSwitchFailure]);

  const shouldScheduleRestoreRetry = useCallback((
    target: ReaderRestoreTarget | null | undefined,
  ): boolean => {
    const transaction = modeSwitchTransactionRef.current;
    if (!transaction?.strict || transaction.stage !== 'restore_target') {
      return true;
    }

    return !areReaderRestoreTargetsEqual(transaction.targetRestoreTarget, target);
  }, []);

  return {
    clearModeSwitchError,
    clearStrictModeSwitchTransaction,
    finalizeStrictModeSwitchFailure,
    flushPersistenceForStrictMode,
    handleStrictModeRestoreSettled,
    modeSwitchError,
    setStrictModeSwitchTransaction,
    shouldScheduleRestoreRetry,
    strictModeSwitchEnabled,
  };
}
