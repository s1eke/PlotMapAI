import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReaderPage from '../ReaderPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../context/ThemeContext';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('ReaderPage', () => {
  it('renders reader layout', async () => {
    render(
      <MemoryRouter initialEntries={['/novel/1/read']}>
        <ThemeProvider>
          <Routes>
            <Route path="/novel/:id/read" element={<ReaderPage />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Chapter 1' })).toBeInTheDocument();
  });
});
