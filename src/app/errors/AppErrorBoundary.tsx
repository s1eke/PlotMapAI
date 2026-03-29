import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appPaths } from '@app/router/paths';
import { AppErrorCode, getErrorPresentation, toAppError, type AppError } from '@shared/errors';
import { reportAppError } from '@app/debug/service';

interface AppErrorBoundaryProps {
  children: ReactNode;
  initialError?: AppError | null;
}

interface AppErrorBoundaryState {
  error: AppError | null;
}

interface AppErrorFallbackProps {
  error: AppError;
}

function AppErrorFallback({ error }: AppErrorFallbackProps) {
  const { t } = useTranslation();
  const presentation = getErrorPresentation(error, 'errors.INTERNAL_ERROR_GENERIC');

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl border border-red-500/20 bg-card-bg/95 p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-semibold text-text-primary">
          {t('errors.boundaryTitle')}
        </h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          {t(presentation.messageKey, {
            ...presentation.messageParams,
            defaultValue: error.debugMessage,
          })}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-border-color/30 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.actions.back')}
          </button>
          <button
            type="button"
            onClick={() => { window.location.hash = appPaths.bookshelf(); }}
            className="inline-flex items-center gap-2 rounded-xl border border-border-color/30 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
          >
            <Home className="h-4 w-4" />
            {t('common.actions.backToBookshelf')}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <RefreshCw className="h-4 w-4" />
            {t('common.actions.retry')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error: toAppError(error, {
        code: AppErrorCode.INTERNAL_ERROR,
        kind: 'internal',
        source: 'app',
        userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
      }),
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const normalized = toAppError(error, {
      code: AppErrorCode.INTERNAL_ERROR,
      kind: 'internal',
      source: 'app',
      userMessageKey: 'errors.INTERNAL_ERROR_GENERIC',
      details: {
        componentStack: errorInfo.componentStack,
      },
    });
    reportAppError(normalized);
    this.setState({ error: normalized });
  }

  override render(): ReactNode {
    const error = this.state.error ?? this.props.initialError ?? null;
    if (error) {
      return <AppErrorFallback error={error} />;
    }

    return this.props.children;
  }
}
