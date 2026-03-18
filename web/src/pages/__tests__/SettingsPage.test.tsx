import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SettingsPage from '../SettingsPage';
import { MemoryRouter } from 'react-router-dom';

const changeLanguage = vi.fn();
const t = (key: string) => key;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t, i18n: { language: 'zh-CN', changeLanguage } }),
}));

describe('SettingsPage', () => {
  it('renders settings sections', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('settings.title')).toBeInTheDocument();
      expect(screen.getByText('settings.toc.title')).toBeInTheDocument();
    });
  });
});
