import type { ReactNode } from 'react';
import Modal from '@shared/components/Modal';

interface SettingsConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: 'default' | 'danger';
  isConfirming?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmIcon?: ReactNode;
}

export default function SettingsConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'default',
  isConfirming = false,
  onClose,
  onConfirm,
  confirmIcon,
}: SettingsConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-6">
        <p className="text-text-primary leading-6">{description}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-2 ${
              confirmVariant === 'danger'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-accent hover:bg-accent-hover'
            }`}
          >
            {confirmIcon}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
