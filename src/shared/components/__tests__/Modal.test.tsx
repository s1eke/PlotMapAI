import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import Modal from '../Modal';

describe('Modal component', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Test">Content</Modal>);
    expect(screen.queryByText('Content')).toBeNull();
  });

  it('renders content and title when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Test Title">Test Content</Modal>);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    render(<Modal isOpen={true} onClose={handleClose} title="Test">Content</Modal>);
    const user = userEvent.setup();
    const buttons = screen.getAllByRole('button');

    await user.click(buttons[0]);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const handleClose = vi.fn();
    render(<Modal isOpen={true} onClose={handleClose} title="Test">Content</Modal>);

    fireEvent.click(document.body.querySelector('[data-slot="modal-backdrop"]') as HTMLDivElement);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('keeps content mounted until the exit animation completes', async () => {
    const { rerender } = render(<Modal isOpen={true} onClose={() => {}} title="Test">Content</Modal>);

    expect(screen.getByText('Content')).toBeInTheDocument();

    rerender(<Modal isOpen={false} onClose={() => {}} title="Test">Content</Modal>);

    expect(screen.getByText('Content')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });
  });

  it('modifies document body overflow on open', async () => {
    const { rerender } = render(<Modal isOpen={true} onClose={() => {}} title="Test">Content</Modal>);

    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Modal isOpen={false} onClose={() => {}} title="Test">Content</Modal>);

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('unset');
    });
  });
});
