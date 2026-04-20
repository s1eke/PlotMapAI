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
  getDebugSnapshot,
  debugLog,
  getDebugFeatureFlags,
  setDebugSnapshot,
} from '@shared/debug';

import * as readerSessionStore from '../store/readerSessionStore';

export type StrictModeSwitchContentMode = Exclude<ReaderMode, 'summary'>;
export type ModeSwitchTransactionStage = 'capture_source' | 'persist_target_state' | 'restore_target';
const STRICT_MODE_SWITCH_RESTORE_TIMEOUT_MS_BY_TARGET: Record<
  StrictModeSwitchContentMode,
  number
> = {
  // Paged restores can legitimately spend extra time warming chapter images
  // and preparing a fresh paginated layout before emitting restore-settled.
  paged: 10000,
  scroll: 2000,
};

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

function getStrictModeSwitchRestoreTimeoutMs(
  targetMode: StrictModeSwitchContentMode,
): number {
  return STRICT_MODE_SWITCH_RESTORE_TIMEOUT_MS_BY_TARGET[targetMode];
}

export interface UseReaderStrictModeSwitchResult {
  bufferStrictModeRestoreSettled: (result: RestoreSettledResult) => boolean;
  beginStrictModeSwitchTransaction: (transaction: ModeSwitchTransaction) => Promise<void>;
  clearModeSwitchError: () => void;
  clearStrictModeSwitchTransaction: () => void;
  completeStrictModeSwitchTransaction: () => boolean;
  consumeBufferedStrictModeRestoreSettled: () => RestoreSettledResult | null;
  finalizeStrictModeSwitchFailure: (params: StrictModeSwitchFailureParams) => AppError;
  flushPersistenceForStrictMode: () => Promise<ReaderPersistenceFailure | null>;
  getStrictModeSwitchTransaction: () => ModeSwitchTransaction | null;
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
  const pendingBufferedRestoreSettledResultRef = useRef<RestoreSettledResult | null>(null);
  const pendingTransactionPromiseRef = useRef<{
    promise: Promise<void>;
    reject: (error: AppError) => void;
    resolve: () => void;
  } | null>(null);
  const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return debugFeatureSubscribe((featureFlags) => {
      setStrictModeSwitchEnabled(featureFlags.readerStrictModeSwitch);
    });
  }, []);

  const clearModeSwitchError = useCallback(() => {
    setModeSwitchError(null);
  }, []);

  const clearStrictModeSwitchTransaction = useCallback(() => {
    if (restoreTimeoutRef.current) {
      clearTimeout(restoreTimeoutRef.current);
      restoreTimeoutRef.current = null;
    }
    pendingBufferedRestoreSettledResultRef.current = null;
    modeSwitchTransactionRef.current = null;
  }, []);

  const completeStrictModeSwitchTransaction = useCallback(() => {
    if (!modeSwitchTransactionRef.current) {
      return false;
    }

    pendingTransactionPromiseRef.current?.resolve();
    pendingTransactionPromiseRef.current = null;
    clearStrictModeSwitchTransaction();
    return true;
  }, [clearStrictModeSwitchTransaction]);

  const beginStrictModeSwitchTransaction = useCallback((transaction: ModeSwitchTransaction) => {
    pendingBufferedRestoreSettledResultRef.current = null;
    modeSwitchTransactionRef.current = {
      ...transaction,
      targetRestoreTarget: cloneReaderRestoreTarget(transaction.targetRestoreTarget),
    };

    if (pendingTransactionPromiseRef.current) {
      return pendingTransactionPromiseRef.current.promise;
    }

    let resolvePromise!: () => void;
    let rejectPromise!: (error: AppError) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    pendingTransactionPromiseRef.current = {
      promise,
      reject: rejectPromise,
      resolve: resolvePromise,
    };
    return promise;
  }, []);

  const getStrictModeSwitchTransaction = useCallback(() => {
    return modeSwitchTransactionRef.current;
  }, []);

  const bufferStrictModeRestoreSettled = useCallback((result: RestoreSettledResult) => {
    const transaction = modeSwitchTransactionRef.current;
    if (!transaction?.strict || transaction.stage === 'restore_target') {
      return false;
    }

    pendingBufferedRestoreSettledResultRef.current = result;
    setDebugSnapshot('reader-mode-switch', {
      chapterIndex: transaction.chapterIndex,
      source: 'useReaderStrictModeSwitch.bufferStrictModeRestoreSettled',
      sourceMode: transaction.sourceMode,
      stage: transaction.stage,
      status: 'buffered_restore_settled',
      strictModeSwitchEnabled: true,
      targetMode: transaction.targetMode,
      bufferedResult: result,
    });
    debugLog('Reader', 'reader strict mode switch buffered restore-settled result', {
      chapterIndex: transaction.chapterIndex,
      sourceMode: transaction.sourceMode,
      stage: transaction.stage,
      targetMode: transaction.targetMode,
      result,
    });
    return true;
  }, []);

  const consumeBufferedStrictModeRestoreSettled = useCallback(() => {
    const bufferedResult = pendingBufferedRestoreSettledResultRef.current;
    pendingBufferedRestoreSettledResultRef.current = null;
    return bufferedResult;
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
    if (params.stage === 'restore_target') {
      pendingTransactionPromiseRef.current?.reject(error);
    }
    pendingTransactionPromiseRef.current = null;
    clearStrictModeSwitchTransaction();
    return error;
  }, [clearStrictModeSwitchTransaction]);

  const setStrictModeSwitchTransaction = useCallback((transaction: ModeSwitchTransaction) => {
    modeSwitchTransactionRef.current = {
      ...transaction,
      targetRestoreTarget: cloneReaderRestoreTarget(transaction.targetRestoreTarget),
    };

    if (restoreTimeoutRef.current) {
      clearTimeout(restoreTimeoutRef.current);
      restoreTimeoutRef.current = null;
    }

    if (transaction.stage !== 'restore_target') {
      return;
    }

    const timeoutMs = getStrictModeSwitchRestoreTimeoutMs(transaction.targetMode);
    restoreTimeoutRef.current = setTimeout(() => {
      const activeTransaction = modeSwitchTransactionRef.current;
      if (
        !activeTransaction?.strict
        || activeTransaction.stage !== 'restore_target'
        || activeTransaction.chapterIndex !== transaction.chapterIndex
        || activeTransaction.targetMode !== transaction.targetMode
      ) {
        return;
      }

      const restoreSnapshot = getDebugSnapshot<Record<string, unknown>>(
        'reader-position-restore',
      )?.value;
      const pendingStatus = typeof restoreSnapshot?.status === 'string'
        ? ` pendingStatus=${restoreSnapshot.status}`
        : '';
      const pendingReason = typeof restoreSnapshot?.reason === 'string'
        ? ` pendingReason=${restoreSnapshot.reason}`
        : '';
      const pendingSource = typeof restoreSnapshot?.source === 'string'
        ? ` pendingSource=${restoreSnapshot.source}`
        : '';

      finalizeStrictModeSwitchFailure({
        chapterIndex: transaction.chapterIndex,
        message: `restore_settled_timeout timeoutMs=${timeoutMs}${pendingStatus}${pendingReason}${pendingSource}`,
        restoreResult: {
          attempts: 1,
          chapterIndex: transaction.chapterIndex,
          mode: transaction.targetMode,
          reason: 'execution_exception',
          retryable: false,
          status: 'failed',
        },
        sourceMode: transaction.sourceMode,
        stage: 'restore_target',
        targetMode: transaction.targetMode,
      });
    }, timeoutMs);
  }, [finalizeStrictModeSwitchFailure]);

  const handleStrictModeRestoreSettled = useCallback((result: RestoreSettledResult): boolean => {
    const transaction = modeSwitchTransactionRef.current;
    if (!transaction?.strict || transaction.stage !== 'restore_target') {
      return false;
    }

    if (result === 'failed' || result === 'skipped') {
      const { lastRestoreResult } = readerSessionStore.getReaderSessionSnapshot();
      finalizeStrictModeSwitchFailure({
        chapterIndex: transaction.chapterIndex,
        message: lastRestoreResult?.reason ?? `restore ${result}`,
        restoreResult: lastRestoreResult,
        sourceMode: transaction.sourceMode,
        stage: 'restore_target',
        targetMode: transaction.targetMode,
      });
      return true;
    }

    return false;
  }, [finalizeStrictModeSwitchFailure]);

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
    bufferStrictModeRestoreSettled,
    beginStrictModeSwitchTransaction,
    clearModeSwitchError,
    clearStrictModeSwitchTransaction,
    completeStrictModeSwitchTransaction,
    consumeBufferedStrictModeRestoreSettled,
    finalizeStrictModeSwitchFailure,
    flushPersistenceForStrictMode,
    getStrictModeSwitchTransaction,
    handleStrictModeRestoreSettled,
    modeSwitchError,
    setStrictModeSwitchTransaction,
    shouldScheduleRestoreRetry,
    strictModeSwitchEnabled,
  };
}
