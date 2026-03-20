import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import Toggle from '../Toggle';

describe('Toggle', () => {
  it('renders with correct aria-checked when unchecked', () => {
    render(<Toggle checked={false} onChange={() => {}} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('renders with correct aria-checked when checked', () => {
    render(<Toggle checked={true} onChange={() => {}} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with toggled value on click', async () => {
    const handleChange = vi.fn();
    render(<Toggle checked={false} onChange={handleChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when already checked', async () => {
    const handleChange = vi.fn();
    render(<Toggle checked={true} onChange={handleChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch'));
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it('does not call onChange when disabled', async () => {
    const handleChange = vi.fn();
    render(<Toggle checked={false} onChange={handleChange} disabled />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
    const user = userEvent.setup();
    await user.click(toggle);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Toggle checked={false} onChange={() => {}} className="custom-class" />);
    const toggle = screen.getByRole('switch');
    expect(toggle.className).toContain('custom-class');
  });
});
