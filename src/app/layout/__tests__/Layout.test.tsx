import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { CACHE_KEYS, storage } from '@infra/storage';
import Layout from '../Layout';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@app/providers/ThemeContext';
import { resetReaderStoresForTests } from '@test/readerTestUtils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../components/ThemeToggle', () => ({
  default: () => <div data-testid="theme-toggle">theme-toggle</div>,
}));

vi.mock('../../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher">language-switcher</div>,
}));

describe('Layout component', () => {
  beforeEach(() => {
    localStorage.clear();
    resetReaderStoresForTests();
    document.head.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('shows global navigation outside reader mode', () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/']}>
        <ThemeProvider>
          <Layout>
            <div>Page Content</div>
          </Layout>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'common.appName' })).toHaveAttribute('href', '/');
    expect(screen.getByTitle('common.nav.settings')).toHaveAttribute('href', '/settings');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
    expect(getByTestId('app-layout-shell')).toHaveStyle({
      '--app-header-height': 'calc(4rem + env(safe-area-inset-top, 0px))',
      '--app-header-offset': '0px',
    });
    expect(getByTestId('app-layout-shell')).toHaveClass('h-[100dvh]', 'overflow-hidden');
    const main = screen.getByText('Page Content').closest('main');
    expect(main).toHaveAttribute('data-scroll-container', 'true');
    expect(main).toHaveClass('hide-scrollbar', 'overflow-y-auto', 'overscroll-y-contain');
    expect(main).toHaveStyle({
      touchAction: 'pan-y',
    });
    expect(document.head.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#f8fafc');
  });

  it('hides the global navigation in reader mode', () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/novel/1/read']}>
        <ThemeProvider>
          <Layout>
            <div>Reader Content</div>
          </Layout>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'common.appName' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('common.nav.settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('language-switcher')).not.toBeInTheDocument();
    expect(screen.getByText('Reader Content')).toBeInTheDocument();
    expect(getByTestId('app-layout-shell')).toHaveStyle({
      '--app-header-height': '0px',
      '--app-header-offset': '0px',
    });
    const main = screen.getByText('Reader Content').closest('main');
    expect(main).not.toHaveAttribute('data-scroll-container');
    expect(main).not.toHaveClass('hide-scrollbar');
    expect(document.head.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#f8fafc');
  });

  it('syncs theme-color to the active reader background in reader mode', async () => {
    storage.cache.set(CACHE_KEYS.readerPreferences, {
      version: 1,
      appTheme: 'light',
      readerTheme: 'night',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });

    render(
      <MemoryRouter initialEntries={['/novel/1/read']}>
        <ThemeProvider>
          <Layout>
            <div>Reader Content</div>
          </Layout>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.head.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#1a1a1a');
    });
  });
});
