import { AppErrorCode, createAppError } from '@shared/errors';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildActionErrorMessage,
  downloadFile,
  getTranslatedErrorMessage,
  groupPurificationRules,
} from '../settingsPage';

describe('settingsPage utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('groups purification rules by group name with an ungrouped fallback', () => {
    expect(groupPurificationRules([
      {
        id: 1,
        name: 'A',
        group: 'General',
        pattern: 'foo',
        replacement: 'bar',
        isRegex: false,
        isEnabled: true,
        order: 1,
        scopeTitle: true,
        scopeContent: true,
        timeoutMs: 3000,
      },
      {
        id: 2,
        name: 'B',
        group: '',
        pattern: 'bar',
        replacement: 'baz',
        isRegex: true,
        isEnabled: true,
        order: 2,
        scopeTitle: true,
        scopeContent: false,
        timeoutMs: 3000,
      },
    ], 'Ungrouped')).toEqual([
      {
        name: 'General',
        rules: [expect.objectContaining({ id: 1 })],
      },
      {
        name: 'Ungrouped',
        rules: [expect.objectContaining({ id: 2 })],
      },
    ]);
  });

  it('translates structured AppError instances to translated keys', () => {
    const t = ((key: string) => key) as unknown as TFunction;

    expect(getTranslatedErrorMessage(createAppError({
      code: AppErrorCode.AI_CONFIG_EXPORT_MISSING,
      kind: 'not-found',
      source: 'settings',
      userMessageKey: 'errors.AI_CONFIG_EXPORT_MISSING',
      debugMessage: 'No AI config to export',
    }), t, 'settings.ai.errorExport')).toBe('errors.AI_CONFIG_EXPORT_MISSING');
    expect(getTranslatedErrorMessage(createAppError({
      code: AppErrorCode.AI_CONFIG_DECRYPT_FAILED,
      kind: 'validation',
      source: 'settings',
      userMessageKey: 'errors.AI_CONFIG_DECRYPT_FAILED',
      debugMessage: 'Decryption failed',
    }), t, 'settings.ai.errorImport')).toBe('errors.AI_CONFIG_DECRYPT_FAILED');
  });

  it('builds prefixed action error messages', () => {
    const t = ((key: string) => key) as unknown as TFunction;

    expect(buildActionErrorMessage('Failed', createAppError({
      code: AppErrorCode.RULE_NOT_FOUND,
      kind: 'not-found',
      source: 'settings',
      userMessageKey: 'errors.RULE_NOT_FOUND',
      debugMessage: 'Rule not found',
    }), t, 'settings.common.updateFailed')).toBe('Failed: errors.RULE_NOT_FOUND');
    expect(buildActionErrorMessage('Failed', '', t, 'settings.common.updateFailed')).toBe('Failed: errors.INTERNAL_ERROR');
  });

  it('downloads a file through an object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: click,
        });
      }
      return element;
    });

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    downloadFile('content', 'rules.yaml', 'text/yaml');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    createElementSpy.mockRestore();
  });
});
