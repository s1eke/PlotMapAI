import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Download, Plus } from 'lucide-react';
import SettingsActionMenu from '../SettingsActionMenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('SettingsActionMenu', () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it('keeps the primary action inline and opens overflow actions from the mobile menu', async () => {
    const user = userEvent.setup();
    const handlePrimary = vi.fn();
    const handleOverflow = vi.fn();

    render(
      <SettingsActionMenu
        primary={[
          {
            label: 'Add',
            icon: <Plus className="w-4 h-4" />,
            onClick: handlePrimary,
          },
        ]}
        overflow={[
          {
            label: 'Export',
            icon: <Download className="w-4 h-4" />,
            onClick: handleOverflow,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(handlePrimary).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'settings.common.moreActions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export' }));
    expect(handleOverflow).toHaveBeenCalledTimes(1);
  });

  it('renders all actions inline on desktop', () => {
    mockMatchMedia(true);

    render(
      <SettingsActionMenu
        primary={[
          {
            label: 'Add',
            icon: <Plus className="w-4 h-4" />,
            onClick: () => {},
          },
        ]}
        overflow={[
          {
            label: 'Export',
            icon: <Download className="w-4 h-4" />,
            onClick: () => {},
          },
        ]}
      />,
    );

    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'settings.common.moreActions' })).not.toBeInTheDocument();
  });
});
