import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import RuleCard from '../RuleCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RuleCard', () => {
  const defaultProps = {
    name: 'Test Rule',
    pattern: '^第.*章',
    isEnabled: true,
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  it('renders rule name and pattern', () => {
    render(<RuleCard {...defaultProps} />);
    expect(screen.getByText('Test Rule')).toBeInTheDocument();
    expect(screen.getByText('^第.*章')).toBeInTheDocument();
  });

  it('shows default badge when isDefault is true', () => {
    render(<RuleCard {...defaultProps} isDefault />);
    expect(screen.getByText('settings.toc.default')).toBeInTheDocument();
  });

  it('does not show default badge when isDefault is false', () => {
    render(<RuleCard {...defaultProps} isDefault={false} />);
    expect(screen.queryByText('settings.toc.default')).not.toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();
    render(<RuleCard {...defaultProps} onEdit={onEdit} />);
    const user = userEvent.setup();
    const editButton = screen.getByTitle('Edit');
    await user.click(editButton);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn();
    render(<RuleCard {...defaultProps} onDelete={onDelete} isCustom />);
    const user = userEvent.setup();
    const deleteButton = screen.getByTitle('Delete');
    await user.click(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides delete button when isCustom is false', () => {
    render(<RuleCard {...defaultProps} isCustom={false} />);
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  it('displays type badge when type is provided', () => {
    render(<RuleCard {...defaultProps} type="regex" />);
    expect(screen.getByText('settings.purification.useRegex')).toBeInTheDocument();
  });

  it('displays priority when provided', () => {
    render(<RuleCard {...defaultProps} priority={5} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it('renders Toggle component', () => {
    render(<RuleCard {...defaultProps} />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });
});
