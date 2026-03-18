import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BookshelfPage from '../BookshelfPage';
import { MemoryRouter } from 'react-router-dom';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('BookshelfPage', () => {
  it('renders correctly', async () => {
    render(
      <MemoryRouter>
        <BookshelfPage />
      </MemoryRouter>
    );
    
    await waitFor(() => {
      expect(screen.getByText('bookshelf.noBooks')).toBeInTheDocument();
    });
  });
});
