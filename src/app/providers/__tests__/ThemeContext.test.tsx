import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { APP_SETTING_KEYS, storage } from '@infra/storage';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { resetReaderSessionStoreForTests } from '@domains/reader';
import { db } from '@infra/db';

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
    resetReaderSessionStoreForTests();
  });

  it('provides default light theme if no preference', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
    }));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  it('toggles theme and updates localStorage/document', () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
    }));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const button = screen.getByText('Toggle');
    fireEvent.click(button);

    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('hydrates theme from primary storage', async () => {
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
    }));
    await storage.primary.settings.set(APP_SETTING_KEYS.appTheme, 'dark');

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
});
