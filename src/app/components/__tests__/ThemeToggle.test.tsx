import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@app/providers/ThemeContext';
import ThemeToggle from '../ThemeToggle';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('toggles the active theme and button title through ThemeContext', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button');

    expect(button).toHaveAttribute('title', 'common.theme.dark');
    await user.click(button);

    expect(button).toHaveAttribute('title', 'common.theme.light');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('honors a persisted dark theme and toggles back to light', async () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'common.theme.light');

    await user.click(button);

    expect(button).toHaveAttribute('title', 'common.theme.dark');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
