import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { useReaderMobileBack } from '../useReaderMobileBack';

describe('useReaderMobileBack', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    window.history.replaceState({ idx: 0 }, '', '#/novel/1/read');
  });

  it('closes the sidebar before navigating', () => {
    const closeSidebar = vi.fn();
    const { result } = renderHook(() => useReaderMobileBack({
      isSidebarOpen: true,
      closeSidebar,
      novelId: 1,
    }));

    act(() => {
      result.current.handleMobileBack();
    });

    expect(closeSidebar).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates back when browser history is available', () => {
    window.history.replaceState({ idx: 1 }, '', '#/novel/1/read');
    const { result } = renderHook(() => useReaderMobileBack({
      isSidebarOpen: false,
      closeSidebar: vi.fn(),
      novelId: 1,
    }));

    act(() => {
      result.current.handleMobileBack();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('falls back to the novel detail page when there is no history entry', () => {
    const { result } = renderHook(() => useReaderMobileBack({
      isSidebarOpen: false,
      closeSidebar: vi.fn(),
      novelId: 1,
    }));

    act(() => {
      result.current.handleMobileBack();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/novel/1', { replace: true });
  });
});
