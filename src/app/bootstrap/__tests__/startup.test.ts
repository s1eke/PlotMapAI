import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInitializeApp, mockReportAppError } = vi.hoisted(() => ({
  mockInitializeApp: vi.fn(),
  mockReportAppError: vi.fn(),
}));

vi.mock('../initializeApp', () => ({
  initializeApp: mockInitializeApp,
}));

vi.mock('@app/debug/service', () => ({
  reportAppError: mockReportAppError,
}));

describe('initializeAppSafely', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when bootstrap succeeds', async () => {
    mockInitializeApp.mockResolvedValue(undefined);

    const { initializeAppSafely } = await import('../startup');

    await expect(initializeAppSafely()).resolves.toBeNull();
    expect(mockReportAppError).not.toHaveBeenCalled();
  });

  it('reports and returns a normalized error when bootstrap fails', async () => {
    const startupError = new Error('startup failed');
    const normalized = { code: 'INTERNAL_ERROR' };
    mockInitializeApp.mockRejectedValue(startupError);
    mockReportAppError.mockReturnValue(normalized);

    const { initializeAppSafely } = await import('../startup');

    await expect(initializeAppSafely()).resolves.toBe(normalized);
    expect(mockReportAppError).toHaveBeenCalledWith(startupError, {
      code: 'INTERNAL_ERROR',
      kind: 'internal',
      source: 'app',
      userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
      details: {
        phase: 'bootstrap',
      },
    });
  });
});
