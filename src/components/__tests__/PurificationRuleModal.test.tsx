import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PurificationRuleModal from '../PurificationRuleModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('PurificationRuleModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('submits changed rule values, toggles, and scopes on success', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PurificationRuleModal isOpen={true} onClose={onClose} onSave={onSave} rule={null} />);

    await user.type(screen.getByPlaceholderText('#广告 替换#JS'), 'Rule A');
    await user.clear(screen.getByPlaceholderText('净化'));
    await user.type(screen.getByPlaceholderText('净化'), 'Custom');
    await user.type(screen.getByPlaceholderText('正则表达式...'), 'foo');
    await user.type(screen.getByPlaceholderText('替换内容 (支持 @js: 预设函数)...'), 'bar');
    await user.click(screen.getAllByRole('switch')[0]);
    await user.click(screen.getByRole('checkbox', { name: 'settings.purification.scopeTitle' }));

    await user.click(screen.getByRole('button', { name: 'common.add' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Rule A',
      group: 'Custom',
      pattern: 'foo',
      replacement: 'bar',
      isRegex: false,
      scopeTitle: false,
      scopeContent: true,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when saving fails', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'));
    const user = userEvent.setup();
    render(<PurificationRuleModal isOpen={true} onClose={onClose} onSave={onSave} rule={null} />);

    await user.type(screen.getByPlaceholderText('#广告 替换#JS'), 'Rule');
    await user.type(screen.getByPlaceholderText('正则表达式...'), 'foo');
    await user.click(screen.getByRole('button', { name: 'common.add' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a security notice for whitelisted @js replacements', async () => {
    render(<PurificationRuleModal isOpen={true} onClose={() => {}} onSave={() => Promise.resolve()} rule={null} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('替换内容 (支持 @js: 预设函数)...'), '@js:fullwidth');

    expect(screen.getByText(/SECURITY: WHITELIST ONLY/)).toBeInTheDocument();
  });
});
