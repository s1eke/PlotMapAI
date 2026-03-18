import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Layout from '../Layout';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('Layout component', () => {
  it('renders header when not in reader mode', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <ThemeProvider>
          <Layout>
            <div>Page Content</div>
          </Layout>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.getByText('common.appName')).toBeInTheDocument();
    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });

  it('hides header in reader mode', () => {
    render(
      <MemoryRouter initialEntries={['/novel/1/read']}>
        <ThemeProvider>
          <Layout>
            <div>Reader Content</div>
          </Layout>
        </ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText('common.appName')).toBeNull();
    expect(screen.getByText('Reader Content')).toBeInTheDocument();
  });
});
