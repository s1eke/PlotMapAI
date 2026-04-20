import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import Toggle from '../Toggle';

describe('Toggle', () => {
  it('calls onChange with true when toggled from false', async () => {
    const handleChange = vi.fn();
    render(<Toggle checked={false} onChange={handleChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when already checked', async () => {
    const handleChange = vi.fn();
    render(<Toggle checked onChange={handleChange} />);
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
});
