import type { ReactElement } from 'react';
import type { AppError } from '@shared/errors';

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import Modal from '@shared/components/Modal';
import { translateAppError } from '@shared/errors';

interface BookDetailDeleteDialogProps {
  deleteError: AppError | null;
  isDeleting: boolean;
  isOpen: boolean;
  novelTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function BookDetailDeleteDialog({
  deleteError,
  isDeleting,
  isOpen,
  novelTitle,
  onClose,
  onConfirm,
}: BookDetailDeleteDialogProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('bookDetail.deleteTitle')}
    >
      <div className="flex flex-col gap-6">
        <p className="text-text-primary">{t('bookDetail.deleteConfirm', { title: novelTitle })}</p>
        {deleteError ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300">
            {translateAppError(deleteError, t, 'bookDetail.deleteFailed')}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg px-4 py-2 font-medium transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
            }}
            disabled={isDeleting}
            className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('common.actions.delete')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
