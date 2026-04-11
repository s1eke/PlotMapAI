import type { Mock } from 'vitest';

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAiSettingsManager,
  usePurificationSettingsManager,
  useTocSettingsManager,
} from '@domains/settings';
import { useSettingsPageViewModel } from '../useSettingsPageViewModel';

vi.mock('@domains/settings', () => ({
  useAiSettingsManager: vi.fn(),
  usePurificationSettingsManager: vi.fn(),
  useTocSettingsManager: vi.fn(),
}));

describe('useSettingsPageViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('__APP_VERSION__', '1.2.3-test');
    (useTocSettingsManager as Mock).mockReturnValue({ kind: 'toc' });
    (usePurificationSettingsManager as Mock).mockReturnValue({ kind: 'purification' });
    (useAiSettingsManager as Mock).mockReturnValue({ kind: 'ai' });
  });

  it('uses toc as the default tab and composes all settings managers', () => {
    const { result } = renderHook(() => useSettingsPageViewModel());

    expect(result.current.activeTab).toBe('toc');
    expect(result.current.appVersion).toBe('1.2.3-test');
    expect(result.current.tocManager).toEqual({ kind: 'toc' });
    expect(result.current.purificationManager).toEqual({ kind: 'purification' });
    expect(result.current.aiManager).toEqual({ kind: 'ai' });
  });

  it('switches tabs through the page view model', () => {
    const { result } = renderHook(() => useSettingsPageViewModel());

    act(() => {
      result.current.setActiveTab('ai');
    });

    expect(result.current.activeTab).toBe('ai');
  });

  it('falls back to an empty version string when the app version is missing', () => {
    vi.stubGlobal('__APP_VERSION__', undefined);

    const { result } = renderHook(() => useSettingsPageViewModel());

    expect(result.current.appVersion).toBe('');
  });
});
