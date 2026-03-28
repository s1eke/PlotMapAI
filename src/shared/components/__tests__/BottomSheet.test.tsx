import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BottomSheet from '../BottomSheet';

function getDragHandle(container: HTMLElement): HTMLDivElement {
  const handle = container.querySelector('[data-slot="sheet-handle-area"]');
  if (!(handle instanceof HTMLDivElement)) {
    throw new Error('drag handle not found');
  }
  return handle;
}

function SheetHarness() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open externally
      </button>
      <button type="button" onClick={() => setIsOpen(false)}>
        Close externally
      </button>
      <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title="Panel title">
        Panel content
      </BottomSheet>
    </>
  );
}

describe('BottomSheet', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders when open and unmounts after the exit animation completes', async () => {
    render(<SheetHarness />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close externally' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open externally' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('respects the backdrop close setting', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title" closeOnBackdrop={false}>
        Panel content
      </BottomSheet>,
    );

    fireEvent.pointerDown(container.querySelector('[data-slot="sheet-backdrop"]') as HTMLButtonElement);
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title" closeOnBackdrop={true}>
        Panel content
      </BottomSheet>,
    );

    fireEvent.pointerDown(container.querySelector('[data-slot="sheet-backdrop"]') as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();

    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title">
        Panel content
      </BottomSheet>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('tracks drag progress and rebounds when the gesture stays below threshold', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title">
        Panel content
      </BottomSheet>,
    );

    const handle = getDragHandle(container);
    const backdrop = container.querySelector('[data-slot="sheet-backdrop"]');

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 120, buttons: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 180, buttons: 1 });

    await waitFor(() => {
      expect(backdrop).not.toBeNull();
      expect(Number((backdrop as HTMLButtonElement).style.opacity)).toBeLessThan(1);
    });

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 180 });

    await waitFor(() => {
      expect(onClose).not.toHaveBeenCalled();
      expect(Number((backdrop as HTMLButtonElement).style.opacity)).toBeCloseTo(1, 3);
    });
  });

  it('closes when the downward drag distance crosses the close threshold', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title">
        Panel content
      </BottomSheet>,
    );

    const handle = getDragHandle(container);

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 120, buttons: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 320, buttons: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 320 });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('applies custom class names to the container, panel, and content slots', () => {
    const { container } = render(
      <BottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="Panel title"
        containerClassName="sheet-root-test"
        panelClassName="sheet-panel-test"
        contentClassName="sheet-content-test"
      >
        Panel content
      </BottomSheet>,
    );

    expect(container.querySelector('[data-slot="sheet-root"]')).toHaveClass('sheet-root-test');
    expect(container.querySelector('[data-slot="sheet-panel"]')).toHaveClass('sheet-panel-test');
    expect(container.querySelector('[data-slot="sheet-content"]')).toHaveClass('sheet-content-test');
  });
});
