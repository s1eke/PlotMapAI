import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useContentClick } from '../useContentClick';

interface TestHarnessProps {
  handleNext: () => void;
  handlePrev: () => void;
  isPagedMode: boolean;
}

function TestHarness({
  handlePrev,
  handleNext,
  isPagedMode,
}: TestHarnessProps) {
  const {
    handleContentClick,
    isChromeVisible: chromeVisible,
    setIsChromeVisible,
  } = useContentClick(isPagedMode, handlePrev, handleNext);

  return (
    <div>
      <div data-testid="content" onClick={handleContentClick} />
      <output data-testid="chrome-visible">{String(chromeVisible)}</output>
      <button
        data-testid="show-chrome"
        onClick={() => setIsChromeVisible(true)}
        type="button"
      >
        show
      </button>
      <button
        data-testid="hide-chrome"
        onClick={() => setIsChromeVisible(false)}
        type="button"
      >
        hide
      </button>
    </div>
  );
}

function setupContentRect(element: HTMLElement, left = 0): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => DOMRect.fromRect({ x: left, y: 0, width: 100, height: 100 }),
  });
}

function renderHarness(isPagedMode: boolean) {
  const handlePrev = vi.fn();
  const handleNext = vi.fn();
  const view = render(
    <TestHarness
      handleNext={handleNext}
      handlePrev={handlePrev}
      isPagedMode={isPagedMode}
    />,
  );
  const content = view.getByTestId('content');
  setupContentRect(content);

  return {
    ...view,
    content,
    handleNext,
    handlePrev,
  };
}

function readChromeVisible(element: HTMLElement): boolean {
  return element.textContent === 'true';
}

function clickContent(element: HTMLElement, clientX: number): void {
  fireEvent.click(element, { clientX, clientY: 50 });
}

describe('useContentClick', () => {
  describe('scroll mode (non-paged)', () => {
    it('toggles isChromeVisible on click', () => {
      const { content, getByTestId } = renderHarness(false);

      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(false);

      clickContent(content, 50);
      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(true);

      clickContent(content, 50);
      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(false);
    });

    it('does not call handlePrev or handleNext', () => {
      const { content, handleNext, handlePrev } = renderHarness(false);

      clickContent(content, 10);

      expect(handlePrev).not.toHaveBeenCalled();
      expect(handleNext).not.toHaveBeenCalled();
    });
  });

  describe('paged mode', () => {
    it('clicking left zone (<25%) calls handlePrev', () => {
      const { content, handleNext, handlePrev } = renderHarness(true);

      clickContent(content, 10);

      expect(handlePrev).toHaveBeenCalled();
      expect(handleNext).not.toHaveBeenCalled();
    });

    it('clicking right zone (>75%) calls handleNext', () => {
      const { content, handleNext, handlePrev } = renderHarness(true);

      clickContent(content, 90);

      expect(handleNext).toHaveBeenCalled();
      expect(handlePrev).not.toHaveBeenCalled();
    });

    it('clicking center zone (25%-75%) toggles chrome', () => {
      const { content, getByTestId, handleNext, handlePrev } = renderHarness(true);

      clickContent(content, 50);

      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(true);
      expect(handlePrev).not.toHaveBeenCalled();
      expect(handleNext).not.toHaveBeenCalled();
    });

    it('hides chrome instead of turning the page when chrome is already visible', () => {
      const { content, getByTestId, handleNext, handlePrev } = renderHarness(true);

      fireEvent.click(getByTestId('show-chrome'));
      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(true);

      clickContent(content, 10);

      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(false);
      expect(handlePrev).not.toHaveBeenCalled();
      expect(handleNext).not.toHaveBeenCalled();
    });

    it('respects offset from getBoundingClientRect left', () => {
      const { content, handlePrev } = renderHarness(true);
      setupContentRect(content, 200);

      clickContent(content, 210);

      expect(handlePrev).toHaveBeenCalled();
    });
  });

  describe('setIsChromeVisible', () => {
    it('allows external control', () => {
      const { getByTestId } = renderHarness(true);

      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(false);

      fireEvent.click(getByTestId('show-chrome'));
      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(true);

      fireEvent.click(getByTestId('hide-chrome'));
      expect(readChromeVisible(getByTestId('chrome-visible'))).toBe(false);
    });
  });
});
