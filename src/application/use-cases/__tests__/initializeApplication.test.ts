import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analysisService } from '@domains/analysis';
import {
  ensureDefaultPurificationRules,
  ensureDefaultTocRules,
} from '@domains/settings';
import { prepareDatabase } from '@infra/db';

vi.mock('@domains/settings', () => ({
  ensureDefaultPurificationRules: vi.fn(),
  ensureDefaultTocRules: vi.fn(),
}));

vi.mock('@domains/analysis', () => ({
  analysisService: {
    initialize: vi.fn(),
  },
}));

vi.mock('@infra/db', () => ({
  prepareDatabase: vi.fn(),
}));

describe('initializeApplication', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(prepareDatabase).mockResolvedValue(undefined);
    vi.mocked(ensureDefaultPurificationRules).mockResolvedValue(undefined);
    vi.mocked(ensureDefaultTocRules).mockResolvedValue(undefined);
    vi.mocked(analysisService.initialize).mockResolvedValue(undefined);
  });

  it('initializes only once after a successful bootstrap', async () => {
    const { initializeApplication } = await import('../initializeApplication');

    await initializeApplication();
    await initializeApplication();

    expect(prepareDatabase).toHaveBeenCalledTimes(1);
    expect(ensureDefaultPurificationRules).toHaveBeenCalledTimes(1);
    expect(ensureDefaultTocRules).toHaveBeenCalledTimes(1);
    expect(analysisService.initialize).toHaveBeenCalledTimes(1);
  });

  it('retries initialization after a failed bootstrap', async () => {
    vi.mocked(prepareDatabase)
      .mockRejectedValueOnce(new Error('bootstrap failed'))
      .mockResolvedValue(undefined);

    const { initializeApplication } = await import('../initializeApplication');

    await expect(initializeApplication()).rejects.toThrow('bootstrap failed');
    await expect(initializeApplication()).resolves.toBeUndefined();

    expect(prepareDatabase).toHaveBeenCalledTimes(2);
    expect(ensureDefaultPurificationRules).toHaveBeenCalledTimes(1);
    expect(ensureDefaultTocRules).toHaveBeenCalledTimes(1);
    expect(analysisService.initialize).toHaveBeenCalledTimes(1);
  });
});
