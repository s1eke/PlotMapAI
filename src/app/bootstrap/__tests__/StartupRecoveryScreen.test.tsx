import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode, createAppError } from '@shared/errors';

import StartupRecoveryScreen from '../StartupRecoveryScreen';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

function createRecoveryError() {
  return createAppError({
    code: AppErrorCode.DATABASE_RECOVERY_REQUIRED,
    kind: 'storage',
    source: 'storage',
    userMessageKey: 'errors.DATABASE_RECOVERY_REQUIRED',
    debugMessage: 'legacy db detected',
    details: {
      databaseName: 'PlotMapAI',
      targetVersion: 2,
    },
  });
}

describe('StartupRecoveryScreen', () => {
  it('opens a confirmation dialog before resetting the database', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn(async () => undefined);

    render(
      <StartupRecoveryScreen
        error={createRecoveryError()}
        isWorking={false}
        onReset={onReset}
        onRetry={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText('startup.recovery.title')).toBeInTheDocument();
    expect(screen.getByText('legacy db detected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'startup.recovery.reset' }));

    expect(screen.getByText('startup.recovery.confirmTitle')).toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'startup.recovery.confirmReset' }));

    await waitFor(() => {
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  it('allows retrying without opening the destructive confirmation flow', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn(async () => undefined);

    render(
      <StartupRecoveryScreen
        error={createRecoveryError()}
        isWorking={false}
        onReset={vi.fn(async () => undefined)}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'startup.recovery.retry' }));

    await waitFor(() => {
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('startup.recovery.confirmTitle')).not.toBeInTheDocument();
  });
});
