import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BookDetailPage from '../BookDetailPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('BookDetailPage', () => {
  it('renders book details', async () => {
    render(
      <MemoryRouter initialEntries={['/novel/1']}>
        <Routes>
          <Route path="/novel/:id" element={<BookDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Mock Novel', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('bookDetail.description')).toBeInTheDocument();
  });
});
