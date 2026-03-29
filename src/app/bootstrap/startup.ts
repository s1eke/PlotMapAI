import type { AppError } from '@shared/errors';

import { reportAppError } from '@app/debug/service';
import { AppErrorCode } from '@shared/errors';

import { initializeApp } from './initializeApp';

export async function initializeAppSafely(): Promise<AppError | null> {
  try {
    await initializeApp();
    return null;
  } catch (error) {
    return reportAppError(error, {
      code: AppErrorCode.INTERNAL_ERROR,
      kind: 'internal',
      source: 'app',
      userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
      details: {
        phase: 'bootstrap',
      },
    });
  }
}
