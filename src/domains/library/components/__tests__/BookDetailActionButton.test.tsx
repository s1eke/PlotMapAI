import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookOpen } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import BookDetailActionButton from '../BookDetailActionButton';

describe('BookDetailActionButton', () => {
  it('renders a spinner while loading', () => {
    render(
      <BookDetailActionButton
        icon={BookOpen}
        label="Start reading"
        onClick={() => undefined}
        loading
      />,
    );

    const button = screen.getByRole('button', { name: 'Start reading' });
    expect(button.querySelector('svg.animate-spin')).not.toBeNull();
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <BookDetailActionButton
        icon={BookOpen}
        label="Pause analysis"
        onClick={onClick}
        disabled
      />,
    );

    const button = screen.getByRole('button', { name: 'Pause analysis' });
    expect(button).toBeDisabled();

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
