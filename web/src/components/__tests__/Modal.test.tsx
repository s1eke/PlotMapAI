import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from '../Modal';
import userEvent from '@testing-library/user-event';

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
    const button = screen.getByRole('button');
    await user.click(button);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
  
  it('modifies document body overflow on open', () => {
    const { rerender } = render(<Modal isOpen={true} onClose={() => {}} title="Test">Content</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    
    rerender(<Modal isOpen={false} onClose={() => {}} title="Test">Content</Modal>);
    expect(document.body.style.overflow).toBe('unset');
  });
});
