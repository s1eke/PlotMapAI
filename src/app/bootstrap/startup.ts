import type { AppError } from '@shared/errors';

import { resetDatabaseForRecovery } from '@infra/db';
import { reportAppError } from '@shared/debug';
import { AppErrorCode, isAppError } from '@shared/errors';

import { initializeApp } from './initializeApp';

export type StartupState =
  | { kind: 'ready' }
  | { kind: 'recovery-required'; error: AppError }
  | { kind: 'error'; error: AppError };

function isRecoveryRequiredError(error: unknown): error is AppError {
  return isAppError(error) && error.code === AppErrorCode.DATABASE_RECOVERY_REQUIRED;
}

export async function initializeAppSafely(): Promise<StartupState> {
  try {
    await initializeApp();
    return { kind: 'ready' };
  } catch (error) {
    if (isRecoveryRequiredError(error)) {
      return {
        kind: 'recovery-required',
        error,
      };
    }

    return {
      kind: 'error',
      error: reportAppError(error, {
        code: AppErrorCode.INTERNAL_ERROR,
        kind: 'internal',
        source: 'app',
        userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
        details: {
          phase: 'bootstrap',
        },
      }),
    };
  }
}

export async function resetDatabaseAndReinitialize(): Promise<StartupState> {
  try {
    await resetDatabaseForRecovery();
  } catch (error) {
    return {
      kind: 'error',
      error: reportAppError(error, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'storage',
        userMessageKey: 'errors.STORAGE_OPERATION_FAILED',
        details: {
          phase: 'bootstrap-recovery-reset',
        },
      }),
    };
  }

  return initializeAppSafely();
}
