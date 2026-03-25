import { reportAppError } from '@app/debug/service';
import { AppErrorCode } from '@shared/errors';

export function registerGlobalErrorHandlers(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleError = (event: ErrorEvent) => {
    reportAppError(event.error ?? new Error(event.message), {
      code: AppErrorCode.INTERNAL_ERROR,
      kind: 'internal',
      source: 'app',
      userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
      details: {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportAppError(event.reason, {
      code: AppErrorCode.INTERNAL_ERROR,
      kind: 'internal',
      source: 'app',
      userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
      details: {
        type: 'unhandledrejection',
      },
    });
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}
