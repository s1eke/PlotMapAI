import type { TFunction } from 'i18next';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildActionErrorMessage,
  downloadFile,
  groupPurificationRules,
  mapAiExportError,
  mapAiImportError,
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

  it('maps AI import and export errors to translated keys', () => {
    const t = ((key: string) => key) as unknown as TFunction;

    expect(mapAiExportError(new Error('No AI config to export'), t)).toBe('settings.ai.errorNoConfig');
    expect(mapAiExportError(new Error('Password must be at least 4 characters'), t)).toBe('settings.ai.errorPasswordShort');
    expect(mapAiImportError(new Error('Decryption failed'), t)).toBe('settings.ai.errorDecryptFailed');
    expect(mapAiImportError(new Error('Invalid config file format'), t)).toBe('settings.ai.errorFileFormat');
  });

  it('builds prefixed action error messages', () => {
    expect(buildActionErrorMessage('Failed', new Error('boom'))).toBe('Failed: boom');
    expect(buildActionErrorMessage('Failed', '')).toBe('Failed');
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
