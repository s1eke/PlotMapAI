import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireNovelCoverResource,
  peekNovelCoverResource,
  releaseNovelCoverResource,
} from '../../utils/novelCoverResourceCache';
import { useNovelCoverResource } from '../useNovelCoverResource';

vi.mock('../../utils/novelCoverResourceCache', () => ({
  acquireNovelCoverResource: vi.fn(),
  peekNovelCoverResource: vi.fn(),
  releaseNovelCoverResource: vi.fn(),
}));

describe('useNovelCoverResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(peekNovelCoverResource).mockReturnValue(undefined);
    vi.mocked(acquireNovelCoverResource).mockResolvedValue('blob:cover');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a cached cover immediately while still acquiring the resource', async () => {
    vi.mocked(peekNovelCoverResource).mockReturnValue('blob:cached-cover');

    const { result } = renderHook(() => useNovelCoverResource(7, true));

    expect(result.current).toBe('blob:cached-cover');
    await waitFor(() => {
      expect(acquireNovelCoverResource).toHaveBeenCalledWith(7);
    });
  });

  it('acquires the cover and releases it on unmount', async () => {
    const { result, unmount } = renderHook(() => useNovelCoverResource(3, true));

    await waitFor(() => {
      expect(result.current).toBe('blob:cover');
    });

    unmount();

    expect(releaseNovelCoverResource).toHaveBeenCalledWith(3);
  });

  it('skips acquisition when the cover is disabled', () => {
    const { result, unmount } = renderHook(() => useNovelCoverResource(5, false));

    expect(result.current).toBeNull();
    expect(acquireNovelCoverResource).not.toHaveBeenCalled();

    unmount();

    expect(releaseNovelCoverResource).not.toHaveBeenCalled();
  });
});
