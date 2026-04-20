import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import InstallPrompt from '../InstallPrompt';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows install button after beforeinstallprompt and forwards the prompt call', async () => {
    render(<InstallPrompt />);

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;

    Object.defineProperty(event, 'prompt', {
      value: prompt,
    });
    Object.defineProperty(event, 'userChoice', {
      value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    window.dispatchEvent(event);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'pwa.install' })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'pwa.install' }));

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('suppresses the prompt after the user dismisses it', async () => {
    const firstPrompt = vi.fn().mockResolvedValue(undefined);
    const firstEvent = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;

    Object.defineProperty(firstEvent, 'prompt', {
      value: firstPrompt,
    });
    Object.defineProperty(firstEvent, 'userChoice', {
      value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    const user = userEvent.setup();
    const firstRender = render(<InstallPrompt />);

    window.dispatchEvent(firstEvent);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'common.actions.close' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'common.actions.close' }));

    expect(localStorage.getItem('plotmapai_install_prompt_dismissed_at')).not.toBeNull();

    firstRender.unmount();
    render(<InstallPrompt />);

    const secondPrompt = vi.fn().mockResolvedValue(undefined);
    const secondEvent = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;

    Object.defineProperty(secondEvent, 'prompt', {
      value: secondPrompt,
    });
    Object.defineProperty(secondEvent, 'userChoice', {
      value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    window.dispatchEvent(secondEvent);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'pwa.install' })).not.toBeInTheDocument();
    });
  });
});
