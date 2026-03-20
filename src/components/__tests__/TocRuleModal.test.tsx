import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TocRuleModal from '../TocRuleModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('TocRuleModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('submits edited rule values and closes on success', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <TocRuleModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        rule={{ id: 1, name: 'Old Rule', rule: '^old', example: 'old', priority: 5, isEnabled: true, isDefault: false }}
      />
    );

    const nameInput = screen.getByPlaceholderText('settings.toc.namePlaceholder');
    const regexInput = screen.getByDisplayValue('^old');
    const exampleInput = screen.getByDisplayValue('old');
    const priorityInput = screen.getByRole('spinbutton');

    await user.clear(nameInput);
    await user.type(nameInput, 'New Rule');
    await user.clear(regexInput);
    await user.type(regexInput, '^chapter');
    await user.clear(exampleInput);
    await user.type(exampleInput, 'Chapter 1');
    await user.clear(priorityInput);
    await user.type(priorityInput, '12');

    await user.click(screen.getByRole('button', { name: 'common.actions.save' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Rule',
      rule: '^chapter',
      example: 'Chapter 1',
      priority: 12,
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open when saving fails', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error('save failed'));
    const user = userEvent.setup();
    render(<TocRuleModal isOpen={true} onClose={onClose} onSave={onSave} rule={null} />);

    await user.type(screen.getByPlaceholderText('settings.toc.namePlaceholder'), 'Rule');
    await user.type(screen.getByPlaceholderText('settings.toc.regexPlaceholder'), '^chapter');
    await user.click(screen.getByRole('button', { name: 'common.actions.add' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets the form to defaults when reopening for a new rule', () => {
    const { rerender } = render(
      <TocRuleModal
        isOpen={true}
        onClose={() => {}}
        onSave={() => Promise.resolve()}
        rule={{ id: 1, name: 'Existing', rule: '^existing', example: 'Existing', priority: 3, isEnabled: false, isDefault: false }}
      />
    );

    expect(screen.getByPlaceholderText('settings.toc.namePlaceholder')).toHaveValue('Existing');
    expect(screen.getByPlaceholderText('settings.toc.examplePlaceholder')).toHaveValue('Existing');

    rerender(<TocRuleModal isOpen={true} onClose={() => {}} onSave={() => Promise.resolve()} rule={null} />);

    expect(screen.getByPlaceholderText('settings.toc.namePlaceholder')).toHaveValue('');
    expect(screen.getByRole('spinbutton')).toHaveValue(10);
  });
});
