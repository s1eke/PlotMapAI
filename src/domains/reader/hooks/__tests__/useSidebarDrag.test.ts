import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSidebarDrag } from '../useSidebarDrag';

// Helper to create a mock TouchEvent-like object for handleDragStart/handleDragMove
function makeTouchEvent(clientY: number): React.TouchEvent {
  return {
    touches: [{ clientY }],
  } as unknown as React.TouchEvent;
}

describe('useSidebarDrag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with sidebar closed', () => {
    const { result } = renderHook(() => useSidebarDrag());
    expect(result.current.isSidebarOpen).toBe(false);
    expect(result.current.dragOffset).toBe(0);
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

  describe('drag gestures', () => {
    it('handleDragStart initializes drag on mobile', () => {
      const { result } = renderHook(() => useSidebarDrag());

      act(() => {
        result.current.handleDragStart(makeTouchEvent(100));
      });

      // dragRef is internal, but we can verify by calling handleDragMove
      act(() => {
        result.current.handleDragMove(makeTouchEvent(200));
      });
      expect(result.current.dragOffset).toBe(100);
    });

    it('handleDragMove tracks positive delta', () => {
      const { result } = renderHook(() => useSidebarDrag());

      act(() => {
        result.current.handleDragStart(makeTouchEvent(100));
      });
      act(() => {
        result.current.handleDragMove(makeTouchEvent(250));
      });
      expect(result.current.dragOffset).toBe(150);
    });

    it('handleDragMove clamps negative delta to 0', () => {
      const { result } = renderHook(() => useSidebarDrag());

      act(() => {
        result.current.handleDragStart(makeTouchEvent(200));
      });
      act(() => {
        result.current.handleDragMove(makeTouchEvent(100));
      });
      expect(result.current.dragOffset).toBe(0);
    });

    it('handleDragEnd closes sidebar when drag exceeds 20% of viewport', () => {
      const { result } = renderHook(() => useSidebarDrag());

      act(() => { result.current.setIsSidebarOpen(true); });

      act(() => {
        result.current.handleDragStart(makeTouchEvent(0));
      });
      // Drag more than 20% of window.innerHeight
      const threshold = window.innerHeight * 0.2 + 1;
      act(() => {
        result.current.handleDragMove(makeTouchEvent(threshold));
      });
      act(() => {
        result.current.handleDragEnd();
      });
      expect(result.current.isSidebarOpen).toBe(false);
      expect(result.current.dragOffset).toBe(0);
    });

    it('handleDragEnd keeps sidebar open when drag below threshold', () => {
      const { result } = renderHook(() => useSidebarDrag());

      act(() => { result.current.setIsSidebarOpen(true); });

      act(() => {
        result.current.handleDragStart(makeTouchEvent(0));
      });
      act(() => {
        result.current.handleDragMove(makeTouchEvent(10));
      });
      act(() => {
        result.current.handleDragEnd();
      });
      expect(result.current.isSidebarOpen).toBe(true);
      expect(result.current.dragOffset).toBe(0);
    });

    it('handleDragEnd does nothing when not dragging', () => {
      const { result } = renderHook(() => useSidebarDrag());

      act(() => { result.current.setIsSidebarOpen(true); });
      act(() => {
        result.current.handleDragEnd();
      });
      expect(result.current.isSidebarOpen).toBe(true);
    });

    it('handleDragMove does nothing when not dragging', () => {
      const { result } = renderHook(() => useSidebarDrag());

      act(() => {
        result.current.handleDragMove(makeTouchEvent(100));
      });
      expect(result.current.dragOffset).toBe(0);
    });
  });

  describe('desktop guard', () => {
    it('handleDragStart does nothing on desktop viewport', () => {
      // Override matchMedia to return desktop
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: true,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      const { result } = renderHook(() => useSidebarDrag());

      act(() => {
        result.current.handleDragStart(makeTouchEvent(100));
      });
      act(() => {
        result.current.handleDragMove(makeTouchEvent(200));
      });
      // Should not track drag because handleDragStart bailed out
      expect(result.current.dragOffset).toBe(0);
    });
  });
});
