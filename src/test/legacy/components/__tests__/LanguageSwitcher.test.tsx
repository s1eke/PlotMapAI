import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import LanguageSwitcher from '../LanguageSwitcher';

const changeLanguage = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN', changeLanguage },
  }),
}));

describe('LanguageSwitcher', () => {
  it('renders language button', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows language code in button', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText('zh')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    render(<LanguageSwitcher />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('简体中文')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('calls changeLanguage when selecting a language', async () => {
    render(<LanguageSwitcher />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('English'));
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });

  it('closes dropdown after selecting a language', async () => {
    render(<LanguageSwitcher />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('English'));
    expect(screen.queryByText('简体中文')).not.toBeInTheDocument();
  });

  it('closes dropdown on click outside', async () => {
    render(
      <div>
        <LanguageSwitcher />
        <div data-testid="outside">Outside</div>
      </div>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('简体中文')).toBeInTheDocument();
    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByText('简体中文')).not.toBeInTheDocument();
  });
});
