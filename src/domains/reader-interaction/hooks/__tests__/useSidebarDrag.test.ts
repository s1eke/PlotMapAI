import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSidebarDrag } from '../useSidebarDrag';

describe('useSidebarDrag', () => {
  it('starts with sidebar closed', () => {
    const { result } = renderHook(() => useSidebarDrag());
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('toggleSidebar opens and closes sidebar', () => {
    const { result } = renderHook(() => useSidebarDrag());

    act(() => { result.current.toggleSidebar(); });
    expect(result.current.isSidebarOpen).toBe(true);

    act(() => { result.current.toggleSidebar(); });
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('setIsSidebarOpen allows direct control', () => {
    const { result } = renderHook(() => useSidebarDrag());

    act(() => { result.current.setIsSidebarOpen(true); });
    expect(result.current.isSidebarOpen).toBe(true);
  });
});
