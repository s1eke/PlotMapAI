import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CharacterGraphPage from '../CharacterGraphPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('CharacterGraphPage', () => {
  it('renders graph components', async () => {
    render(
      <MemoryRouter initialEntries={['/novel/1/graph']}>
        <Routes>
          <Route path="/novel/:id/graph" element={<CharacterGraphPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('characterGraph.title')).toBeInTheDocument();
    });
  });
});
