import type { AppError } from '@shared/errors';

import { useCallback, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getErrorPresentation } from '@shared/errors';
import Modal from '@shared/components/Modal';

interface StartupRecoveryScreenProps {
  error: AppError;
  isWorking: boolean;
  onReset: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export default function StartupRecoveryScreen({
  error,
  isWorking,
  onReset,
  onRetry,
}: StartupRecoveryScreenProps) {
  const { t } = useTranslation();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const presentation = getErrorPresentation(error, 'errors.DATABASE_RECOVERY_REQUIRED');

  const handleConfirmReset = useCallback(async (): Promise<void> => {
    setIsConfirmOpen(false);
    await onReset();
  }, [onReset]);

  const handleOpenConfirm = useCallback((): void => {
    setIsConfirmOpen(true);
  }, []);

  const handleCloseConfirm = useCallback((): void => {
    setIsConfirmOpen(false);
  }, []);

  const handleRetryClick = useCallback((): void => {
    onRetry().catch(() => undefined);
  }, [onRetry]);

  const handleConfirmResetClick = useCallback((): void => {
    handleConfirmReset().catch(() => undefined);
  }, [handleConfirmReset]);

  return (
    <>
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-6">
        <div className="w-full max-w-2xl rounded-3xl border border-red-500/20 bg-card-bg/95 p-8 shadow-xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle className="h-8 w-8" />
          </div>

          <div className="space-y-4 text-center">
            <h1 className="text-3xl font-semibold text-text-primary">
              {t('startup.recovery.title')}
            </h1>
            <p className="text-sm leading-6 text-text-secondary">
              {t(presentation.messageKey, {
                ...presentation.messageParams,
                defaultValue: error.debugMessage,
              })}
            </p>
            <p className="text-sm leading-6 text-text-secondary">
              {t('startup.recovery.description')}
            </p>
            <p className="text-xs leading-5 text-text-secondary">
              {t('startup.recovery.debugHint', {
                dbName: String(error.details?.databaseName ?? 'PlotMapAI'),
                version: String(error.details?.targetVersion ?? ''),
              })}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={handleRetryClick}
              disabled={isWorking}
              className="inline-flex items-center gap-2 rounded-xl border border-border-color/30 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('startup.recovery.retry')}
            </button>
            <button
              type="button"
              onClick={handleOpenConfirm}
              disabled={isWorking}
              className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {t('startup.recovery.reset')}
            </button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isConfirmOpen}
        onClose={handleCloseConfirm}
        title={t('startup.recovery.confirmTitle')}
        className="max-w-lg"
      >
        <div className="flex flex-col gap-6">
          <p className="leading-6 text-text-primary">
            {t('startup.recovery.confirmDescription')}
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseConfirm}
              disabled={isWorking}
              className="rounded-lg px-4 py-2 font-medium transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('startup.recovery.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmResetClick}
              disabled={isWorking}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('startup.recovery.confirmReset')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
