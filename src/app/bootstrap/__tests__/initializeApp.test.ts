import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInitializeApplication } = vi.hoisted(() => ({
  mockInitializeApplication: vi.fn(),
}));

vi.mock('@application/use-cases/initializeApplication', () => ({
  initializeApplication: mockInitializeApplication,
}));

describe('initializeApp', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockInitializeApplication.mockResolvedValue(undefined);
  });

  it('delegates bootstrap orchestration to initializeApplication', async () => {
    const { initializeApp } = await import('../initializeApp');

    await initializeApp();

    expect(mockInitializeApplication).toHaveBeenCalledTimes(1);
  });
});
