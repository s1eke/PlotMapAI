import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Layout from '../Layout';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@app/providers/ThemeContext';

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
  it('shows global navigation outside reader mode', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ThemeProvider>
          <Layout>
            <div>Page Content</div>
          </Layout>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'common.appName' })).toHaveAttribute('href', '/');
    expect(screen.getByTitle('common.nav.settings')).toHaveAttribute('href', '/settings');
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('hides the global navigation in reader mode', () => {
    render(
      <MemoryRouter initialEntries={['/novel/1/read']}>
        <ThemeProvider>
          <Layout>
            <div>Reader Content</div>
          </Layout>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: 'common.appName' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('common.nav.settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('language-switcher')).not.toBeInTheDocument();
    expect(screen.getByText('Reader Content')).toBeInTheDocument();
  });
});
