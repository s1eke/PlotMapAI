import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useContentClick } from '../useContentClick';

describe('useContentClick', () => {
  describe('scroll mode (non-paged)', () => {
    it('toggles isChromeVisible on click', () => {
      const { result } = renderHook(() =>
        useContentClick(false, vi.fn(), vi.fn())
      );

      expect(result.current.isChromeVisible).toBe(false);

      const target = document.createElement('div');
      Object.defineProperty(target, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
      });

      const event = {
        currentTarget: target,
        clientX: 50,
        clientY: 50,
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => { result.current.handleContentClick(event); });
      expect(result.current.isChromeVisible).toBe(true);

      act(() => { result.current.handleContentClick(event); });
      expect(result.current.isChromeVisible).toBe(false);
    });

    it('does not call handlePrev or handleNext', () => {
      const handlePrev = vi.fn();
      const handleNext = vi.fn();
      const { result } = renderHook(() =>
        useContentClick(false, handlePrev, handleNext)
      );

      const target = document.createElement('div');
      Object.defineProperty(target, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
      });

      const event = {
        currentTarget: target,
        clientX: 10,
        clientY: 50,
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => { result.current.handleContentClick(event); });
      expect(handlePrev).not.toHaveBeenCalled();
      expect(handleNext).not.toHaveBeenCalled();
    });
  });

  describe('paged mode', () => {
    it('clicking left zone (<25%) calls handlePrev', () => {
      const handlePrev = vi.fn();
      const handleNext = vi.fn();
      const { result } = renderHook(() =>
        useContentClick(true, handlePrev, handleNext)
      );

      const target = document.createElement('div');
      Object.defineProperty(target, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
      });

      const event = {
        currentTarget: target,
        clientX: 10,
        clientY: 50,
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => { result.current.handleContentClick(event); });
      expect(handlePrev).toHaveBeenCalled();
      expect(handleNext).not.toHaveBeenCalled();
    });

    it('clicking right zone (>75%) calls handleNext', () => {
      const handlePrev = vi.fn();
      const handleNext = vi.fn();
      const { result } = renderHook(() =>
        useContentClick(true, handlePrev, handleNext)
      );

      const target = document.createElement('div');
      Object.defineProperty(target, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
      });

      const event = {
        currentTarget: target,
        clientX: 90,
        clientY: 50,
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => { result.current.handleContentClick(event); });
      expect(handleNext).toHaveBeenCalled();
      expect(handlePrev).not.toHaveBeenCalled();
    });

    it('clicking center zone (25%-75%) toggles chrome', () => {
      const handlePrev = vi.fn();
      const handleNext = vi.fn();
      const { result } = renderHook(() =>
        useContentClick(true, handlePrev, handleNext)
      );

      const target = document.createElement('div');
      Object.defineProperty(target, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
      });

      const event = {
        currentTarget: target,
        clientX: 50,
        clientY: 50,
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => { result.current.handleContentClick(event); });
      expect(result.current.isChromeVisible).toBe(true);
      expect(handlePrev).not.toHaveBeenCalled();
      expect(handleNext).not.toHaveBeenCalled();
    });

    it('respects offset from getBoundingClientRect left', () => {
      const handlePrev = vi.fn();
      const handleNext = vi.fn();
      const { result } = renderHook(() =>
        useContentClick(true, handlePrev, handleNext)
      );

      const target = document.createElement('div');
      Object.defineProperty(target, 'getBoundingClientRect', {
        value: () => ({ left: 200, top: 0, width: 100, height: 100, right: 300, bottom: 100 }),
      });

      // clientX 210 -> localX 10 -> ratio 0.1 (<0.25, left zone)
      const event = {
        currentTarget: target,
        clientX: 210,
        clientY: 50,
      } as unknown as React.MouseEvent<HTMLDivElement>;

      act(() => { result.current.handleContentClick(event); });
      expect(handlePrev).toHaveBeenCalled();
    });
  });

  describe('setIsChromeVisible', () => {
    it('allows external control', () => {
      const { result } = renderHook(() =>
        useContentClick(true, vi.fn(), vi.fn())
      );

      expect(result.current.isChromeVisible).toBe(false);
      act(() => { result.current.setIsChromeVisible(true); });
      expect(result.current.isChromeVisible).toBe(true);
      act(() => { result.current.setIsChromeVisible(false); });
      expect(result.current.isChromeVisible).toBe(false);
    });
  });
});
