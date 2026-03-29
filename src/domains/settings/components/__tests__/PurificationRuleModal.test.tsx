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

    await user.type(screen.getByPlaceholderText('settings.purification.namePlaceholder'), 'Rule A');
    await user.clear(screen.getByPlaceholderText('settings.purification.groupPlaceholder'));
    await user.type(screen.getByPlaceholderText('settings.purification.groupPlaceholder'), 'Custom');
    await user.type(screen.getByPlaceholderText('settings.purification.patternPlaceholder'), 'foo');
    await user.type(screen.getByPlaceholderText('settings.purification.replacementPlaceholder'), 'bar');
    await user.click(screen.getAllByRole('switch')[0]);
    await user.click(screen.getByRole('checkbox', { name: 'settings.purification.scopeTitle' }));

    await user.click(screen.getByRole('button', { name: 'common.actions.add' }));

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

    await user.type(screen.getByPlaceholderText('settings.purification.namePlaceholder'), 'Rule');
    await user.type(screen.getByPlaceholderText('settings.purification.patternPlaceholder'), 'foo');
    await user.click(screen.getByRole('button', { name: 'common.actions.add' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a security notice for whitelisted @js replacements', async () => {
    render(<PurificationRuleModal isOpen={true} onClose={() => {}} onSave={() => Promise.resolve()} rule={null} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('settings.purification.replacementPlaceholder'), '@js:fullwidth');

    expect(screen.getByText('settings.purification.jsSecurityBadge')).toBeInTheDocument();
  });

  it('keeps optional inputs controlled when editing a sparse rule', () => {
    render(
      <PurificationRuleModal
        isOpen={true}
        onClose={() => {}}
        onSave={() => Promise.resolve()}
        rule={{
          id: 1,
          name: 'Sparse Rule',
          group: 'Custom',
          pattern: 'foo',
          replacement: '',
          isRegex: true,
          isEnabled: true,
          order: 3,
          scopeTitle: true,
          scopeContent: true,
          isDefault: false,
          timeoutMs: 3000,
        }}
      />,
    );

    expect(screen.getByPlaceholderText('settings.purification.bookScopePlaceholder')).toHaveValue('');
    expect(screen.getByPlaceholderText('settings.purification.excludeBookScopePlaceholder')).toHaveValue('');
    expect(screen.getByPlaceholderText('settings.purification.replacementPlaceholder')).toHaveValue('');
  });
});
