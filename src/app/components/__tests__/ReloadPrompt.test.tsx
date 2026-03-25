import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import ReloadPrompt from '../ReloadPrompt';
import { __resetRegisterSwState, __setRegisterSwState } from '@test/mocks/pwaRegisterReact';
import { DEBUG_SHOW_UPDATE_TOAST_EVENT } from '@app/debug/service';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ReloadPrompt', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '1.0.1-test');
    localStorage.clear();
    __resetRegisterSwState();
  });

  it('renders a lightweight update toast when a refresh is available', () => {
    __setRegisterSwState({
      needRefresh: true,
    });

    render(<ReloadPrompt />);

    expect(screen.getByText('pwa.updateAvailable')).toBeInTheDocument();
    expect(screen.getByText('pwa.updateDescription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pwa.reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pwa.later' })).toBeInTheDocument();
  });

  it('triggers the service worker update when refreshing', async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);

    __setRegisterSwState({
      needRefresh: true,
      updateServiceWorker,
    });

    render(<ReloadPrompt />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'pwa.reload' }));

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('remembers dismissal for the current version', async () => {
    const setNeedRefresh = vi.fn();

    __setRegisterSwState({
      needRefresh: true,
      setNeedRefresh,
    });

    render(<ReloadPrompt />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'pwa.later' }));

    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    expect(localStorage.getItem('plotmapai_update_prompt_dismissed')).toContain('1.0.1-test');
  });

  it('can show the toast manually through the debug event', () => {
    render(<ReloadPrompt />);

    act(() => {
      window.dispatchEvent(new CustomEvent(DEBUG_SHOW_UPDATE_TOAST_EVENT));
    });

    return waitFor(() => {
      expect(screen.getByText('pwa.updateAvailable')).toBeInTheDocument();
    });
  });
});
