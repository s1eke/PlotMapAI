import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockEnsureDefaultPurificationRules,
  mockEnsureDefaultTocRules,
  mockInitializeAnalysisRuntime,
} = vi.hoisted(() => ({
  mockEnsureDefaultPurificationRules: vi.fn(),
  mockEnsureDefaultTocRules: vi.fn(),
  mockInitializeAnalysisRuntime: vi.fn(),
}));

vi.mock('@domains/settings', () => ({
  ensureDefaultPurificationRules: mockEnsureDefaultPurificationRules,
  ensureDefaultTocRules: mockEnsureDefaultTocRules,
}));

vi.mock('@domains/analysis', () => ({
  initializeAnalysisRuntime: mockInitializeAnalysisRuntime,
}));

describe('initializeApp', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockEnsureDefaultPurificationRules.mockResolvedValue(undefined);
    mockEnsureDefaultTocRules.mockResolvedValue(undefined);
    mockInitializeAnalysisRuntime.mockResolvedValue(undefined);
  });

  it('initializes only once after a successful bootstrap', async () => {
    const { initializeApp } = await import('../initializeApp');

    await initializeApp();
    await initializeApp();

    expect(mockEnsureDefaultPurificationRules).toHaveBeenCalledTimes(1);
    expect(mockEnsureDefaultTocRules).toHaveBeenCalledTimes(1);
    expect(mockInitializeAnalysisRuntime).toHaveBeenCalledTimes(1);
  });

  it('retries initialization after a failed bootstrap', async () => {
    mockEnsureDefaultPurificationRules
      .mockRejectedValueOnce(new Error('bootstrap failed'))
      .mockResolvedValue(undefined);

    const { initializeApp } = await import('../initializeApp');

    await expect(initializeApp()).rejects.toThrow('bootstrap failed');
    await expect(initializeApp()).resolves.toBeUndefined();

    expect(mockEnsureDefaultPurificationRules).toHaveBeenCalledTimes(2);
    expect(mockEnsureDefaultTocRules).toHaveBeenCalledTimes(2);
    expect(mockInitializeAnalysisRuntime).toHaveBeenCalledTimes(2);
  });
});
