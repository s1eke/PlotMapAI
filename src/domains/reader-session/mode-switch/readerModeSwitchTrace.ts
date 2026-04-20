import type {
  ReaderMode,
  ReaderRestoreTarget,
  RestoreStatus,
} from '@shared/contracts/reader';

import { isReaderTraceEnabled, recordReaderTrace } from '@shared/reader-trace';

import type { ModeSwitchTransactionStage } from './useReaderStrictModeSwitch';

interface TraceModeSwitchBaseParams {
  restoreStatus: RestoreStatus;
  sourceMode: ReaderMode;
  strict: boolean;
  targetMode: ReaderMode;
}

function buildResolvedTargetDetails(params: {
  chapterIndex: number;
  nextLastContentMode: 'paged' | 'scroll';
  sourceMode: ReaderMode;
  strict: boolean;
  targetMode: ReaderMode;
  targetRestoreTarget: ReaderRestoreTarget;
}) {
  const {
    chapterIndex,
    nextLastContentMode,
    sourceMode,
    strict,
    targetMode,
    targetRestoreTarget,
  } = params;

  return {
    chapterProgress: targetRestoreTarget.chapterProgress ?? null,
    hasLocator: Boolean(targetRestoreTarget.locator),
    locatorBoundary: targetRestoreTarget.locatorBoundary ?? null,
    nextLastContentMode,
    sourceChapterIndex: chapterIndex,
    sourceMode,
    strict,
    targetMode,
  };
}

function buildFinishedTargetDetails(params: {
  sourceMode: ReaderMode;
  strict: boolean;
  targetMode: ReaderMode;
  targetRestoreTarget: ReaderRestoreTarget;
}) {
  const {
    sourceMode,
    strict,
    targetMode,
    targetRestoreTarget,
  } = params;

  return {
    chapterProgress: targetRestoreTarget.chapterProgress ?? null,
    hasLocator: Boolean(targetRestoreTarget.locator),
    locatorBoundary: targetRestoreTarget.locatorBoundary ?? null,
    sourceMode,
    strict,
    targetMode,
  };
}

export function traceModeSwitchStarted(params: {
  chapterIndex: number;
  restoreStatus: RestoreStatus;
} & TraceModeSwitchBaseParams): void {
  if (!isReaderTraceEnabled()) {
    return;
  }

  recordReaderTrace('mode_switch_started', {
    chapterIndex: params.chapterIndex,
    mode: params.sourceMode,
    restoreStatus: params.restoreStatus,
    details: {
      sourceMode: params.sourceMode,
      strict: params.strict,
      targetMode: params.targetMode,
    },
  });
}

export function traceModeSwitchTargetResolved(params: {
  chapterIndex: number;
  nextLastContentMode: 'paged' | 'scroll';
  restoreStatus: RestoreStatus;
  sourceMode: ReaderMode;
  strict: boolean;
  targetMode: ReaderMode;
  targetRestoreTarget: ReaderRestoreTarget;
}): void {
  if (!isReaderTraceEnabled()) {
    return;
  }

  recordReaderTrace('mode_switch_target_resolved', {
    chapterIndex: params.targetRestoreTarget.chapterIndex,
    mode: params.targetMode,
    restoreStatus: params.restoreStatus,
    details: buildResolvedTargetDetails(params),
  });
}

export function traceModeSwitchFinished(params: {
  restoreStatus: RestoreStatus;
  sourceMode: ReaderMode;
  strict: boolean;
  targetMode: ReaderMode;
  targetRestoreTarget: ReaderRestoreTarget;
}): void {
  if (!isReaderTraceEnabled()) {
    return;
  }

  recordReaderTrace('mode_switch_finished', {
    chapterIndex: params.targetRestoreTarget.chapterIndex,
    mode: params.targetMode,
    restoreStatus: params.restoreStatus,
    details: buildFinishedTargetDetails(params),
  });
}

export function traceModeSwitchError(params: {
  chapterIndex: number;
  error: unknown;
  restoreStatus: RestoreStatus;
  sourceMode: ReaderMode;
  stage: ModeSwitchTransactionStage;
  strict: boolean;
  targetMode: ReaderMode;
}): void {
  if (!isReaderTraceEnabled()) {
    return;
  }

  recordReaderTrace('mode_switch_error', {
    chapterIndex: params.chapterIndex,
    mode: params.sourceMode,
    restoreStatus: params.restoreStatus,
    details: {
      message: params.error instanceof Error ? params.error.message : String(params.error),
      sourceMode: params.sourceMode,
      stage: params.stage,
      strict: params.strict,
      targetMode: params.targetMode,
    },
  });
}
