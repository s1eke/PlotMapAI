import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createAppError, AppErrorCode } from '@shared/errors';

import AppErrorBoundary from '../AppErrorBoundary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('AppErrorBoundary', () => {
  it('renders the fallback immediately when an initial error is provided', () => {
    const startupError = createAppError({
      code: AppErrorCode.INTERNAL_ERROR,
      kind: 'internal',
      source: 'app',
      userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
      debugMessage: 'startup failed',
    });

    render(
      <AppErrorBoundary initialError={startupError}>
        <div>App content</div>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('errors.boundaryTitle')).toBeInTheDocument();
    expect(screen.getByText('startup failed')).toBeInTheDocument();
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
  });
});
