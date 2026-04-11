import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode, createAppError } from '@shared/errors';

const { mockInitializeApp, mockReportAppError, mockResetDatabaseForRecovery } = vi.hoisted(() => ({
  mockInitializeApp: vi.fn(),
  mockReportAppError: vi.fn(),
  mockResetDatabaseForRecovery: vi.fn(),
}));

vi.mock('../initializeApp', () => ({
  initializeApp: mockInitializeApp,
}));

vi.mock('@shared/debug', () => ({
  reportAppError: mockReportAppError,
}));

vi.mock('@infra/db', () => ({
  resetDatabaseForRecovery: mockResetDatabaseForRecovery,
}));

describe('initializeAppSafely', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when bootstrap succeeds', async () => {
    mockInitializeApp.mockResolvedValue(undefined);

    const { initializeAppSafely } = await import('../startup');

    await expect(initializeAppSafely()).resolves.toEqual({ kind: 'ready' });
    expect(mockReportAppError).not.toHaveBeenCalled();
  });

  it('returns a recovery state for incompatible legacy databases without double-reporting', async () => {
    const recoveryError = createAppError({
      code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
      kind: 'storage',
      source: 'storage',
      userMessageKey: 'errors.DATABASE_RECOVERY_REQUIRED',
      debugMessage: 'legacy database needs recovery',
    });
    mockInitializeApp.mockRejectedValue(recoveryError);

    const { initializeAppSafely } = await import('../startup');

    await expect(initializeAppSafely()).resolves.toEqual({
      kind: 'recovery-required',
      error: recoveryError,
    });
    expect(mockReportAppError).not.toHaveBeenCalled();
  });

  it('reports and returns a normalized error when bootstrap fails', async () => {
    const startupError = new Error('startup failed');
    const normalized = { code: 'INTERNAL_ERROR' };
    mockInitializeApp.mockRejectedValue(startupError);
    mockReportAppError.mockReturnValue(normalized);

    const { initializeAppSafely } = await import('../startup');

    await expect(initializeAppSafely()).resolves.toEqual({
      kind: 'error',
      error: normalized,
    });
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

  it('resets the database and re-runs startup when recovery is confirmed', async () => {
    mockResetDatabaseForRecovery.mockResolvedValue(undefined);
    mockInitializeApp.mockResolvedValue(undefined);

    const { resetDatabaseAndReinitialize } = await import('../startup');

    await expect(resetDatabaseAndReinitialize()).resolves.toEqual({ kind: 'ready' });
    expect(mockResetDatabaseForRecovery).toHaveBeenCalledTimes(1);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
  });
});
