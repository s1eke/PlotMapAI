import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetAppThemeStoreForTests } from '@shared/stores/appThemeStore';
import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { db } from '@infra/db';

const LEGACY_THEME_CACHE_KEY = 'theme';

const TestComponent = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
};

describe('ThemeContext', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    resetAppThemeStoreForTests();
  });

  it('provides default light theme if no preference', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
    }));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  it('does not read the legacy theme cache key', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
    }));
    localStorage.setItem('theme', 'dark');
    resetAppThemeStoreForTests();

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  it('toggles theme and updates localStorage/document', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
    }));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    const button = screen.getByText('Toggle');
    fireEvent.click(button);

    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
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

  it('hydrates theme from primary storage', async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
    }));
    await storage.primary.settings.set(APP_SETTING_KEYS.readerPreferences, {
      version: 1,
      appTheme: 'dark',
      readerTheme: 'auto',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('resets the dark class back to the system preference', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
    }));

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

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    storage.cache.remove(CACHE_KEYS.readerPreferences);
    resetAppThemeStoreForTests();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
