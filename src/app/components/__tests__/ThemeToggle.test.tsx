import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@app/providers/ThemeContext';
import { resetAppThemeStoreForTests } from '@shared/stores/appThemeStore';
import { CACHE_KEYS, storage } from '@infra/storage';
import ThemeToggle from '../ThemeToggle';

const LEGACY_THEME_CACHE_KEY = 'theme';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    resetAppThemeStoreForTests();
  });

  it('toggles the active theme and button title through ThemeContext', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button');

    expect(button).toHaveAttribute('title', 'common.theme.dark');
    await user.click(button);

    expect(button).toHaveAttribute('title', 'common.theme.light');
    expect(storage.cache.getJson(CACHE_KEYS.readerPreferences)).toEqual({
      version: 1,
      appTheme: 'dark',
      readerTheme: 'auto',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });
    expect(localStorage.getItem(LEGACY_THEME_CACHE_KEY)).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('honors a persisted dark theme and toggles back to light', async () => {
    storage.cache.set(CACHE_KEYS.readerPreferences, {
      version: 1,
      appTheme: 'dark',
      readerTheme: 'auto',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });
    resetAppThemeStoreForTests();
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', 'common.theme.light');

    await user.click(button);

    expect(button).toHaveAttribute('title', 'common.theme.dark');
    expect(storage.cache.getJson(CACHE_KEYS.readerPreferences)).toEqual({
      version: 1,
      appTheme: 'light',
      readerTheme: 'auto',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
