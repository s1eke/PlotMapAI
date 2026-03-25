import type { TFunction } from 'i18next';
import type {
  AppError,
  AppErrorMessageParams,
  AppErrorSeverity,
  ToAppErrorContext,
} from './model';
import { toAppError } from './model';

export interface ErrorPresentation {
  messageKey: string;
  messageParams?: AppErrorMessageParams;
  retryable: boolean;
  severity: AppErrorSeverity;
}

export function getErrorPresentation(error: AppError, fallbackKey: string): ErrorPresentation {
  const messageKey = error.userVisible
    ? (error.userMessageKey || `errors.${error.code}`)
    : fallbackKey;

  return {
    messageKey,
    messageParams: error.userMessageParams,
    retryable: error.retryable,
    severity: error.severity,
  };
}

export function translateAppError(
  error: unknown,
  t: TFunction,
  fallbackKey: string,
  context: ToAppErrorContext = {},
): string {
  const normalized = toAppError(error, context);
  const presentation = getErrorPresentation(normalized, fallbackKey);
  return t(presentation.messageKey, {
    ...presentation.messageParams,
    defaultValue: normalized.debugMessage,
  });
}
