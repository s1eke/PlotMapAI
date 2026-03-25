import { AppErrorCode } from '@shared/errors';
import { AnalysisConfigError } from './errors';

export function cleanText(value: unknown, maxLength?: number): string {
  if (value === null || value === undefined) return '';
  let text = String(value).trim();
  text = text.replace(/\s+/g, ' ');
  if (maxLength !== undefined) text = text.slice(0, maxLength);
  return text;
}

export function coerceContextSize(value: unknown, defaultVal: number): number {
  const contextSize = Number(value);
  if (!Number.isFinite(contextSize)) {
    throw new AnalysisConfigError('上下文大小必须是整数。', {
      code: AppErrorCode.AI_CONTEXT_SIZE_INVALID,
      userMessageKey: 'errors.AI_CONTEXT_SIZE_INVALID',
    });
  }
  return contextSize || defaultVal;
}

export function coerceWeight(value: unknown): number {
  const weight = Number(value);
  if (!Number.isFinite(weight)) return 0;
  return Math.max(0, Math.min(weight, 100));
}

export function estimatePromptBudget(text: string): number {
  return new TextEncoder().encode(text).length;
}
