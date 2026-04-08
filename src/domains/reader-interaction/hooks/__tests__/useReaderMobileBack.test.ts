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
      closeImageViewer: vi.fn(),
      fallbackHref: '/novel/1',
      isImageViewerOpen: false,
      isSidebarOpen: true,
      closeSidebar,
    }));

    act(() => {
      result.current.handleMobileBack();
    });

    expect(closeSidebar).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('closes the image viewer before touching sidebar or navigation', () => {
    const closeImageViewer = vi.fn();
    const closeSidebar = vi.fn();
    const { result } = renderHook(() => useReaderMobileBack({
      closeImageViewer,
      fallbackHref: '/novel/1',
      isImageViewerOpen: true,
      isSidebarOpen: true,
      closeSidebar,
    }));

    act(() => {
      result.current.handleMobileBack();
    });

    expect(closeImageViewer).toHaveBeenCalledTimes(1);
    expect(closeSidebar).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates back when browser history is available', () => {
    window.history.replaceState({ idx: 1 }, '', '#/novel/1/read');
    const { result } = renderHook(() => useReaderMobileBack({
      closeImageViewer: vi.fn(),
      fallbackHref: '/novel/1',
      isImageViewerOpen: false,
      isSidebarOpen: false,
      closeSidebar: vi.fn(),
    }));

    act(() => {
      result.current.handleMobileBack();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('falls back to the novel detail page when there is no history entry', () => {
    const { result } = renderHook(() => useReaderMobileBack({
      closeImageViewer: vi.fn(),
      fallbackHref: '/novel/1',
      isImageViewerOpen: false,
      isSidebarOpen: false,
      closeSidebar: vi.fn(),
    }));

    act(() => {
      result.current.handleMobileBack();
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/novel/1', { replace: true });
  });
});
