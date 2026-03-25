import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@shared/utils/cn';
import type { SettingsFeedbackState } from '../../utils/settingsPage';

interface SettingsFeedbackBannerProps {
  feedback: SettingsFeedbackState | null;
  onDismiss?: () => void;
  className?: string;
}

export default function SettingsFeedbackBanner({
  feedback,
  onDismiss,
  className,
}: SettingsFeedbackBannerProps) {
  const { t } = useTranslation();

  if (!feedback) return null;

  const isSuccess = feedback.type === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={cn(
        'rounded-xl border px-4 py-3 flex items-start gap-3',
        isSuccess
          ? 'border-emerald-300/80 bg-emerald-50/95 text-emerald-900 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-100'
          : 'border-red-300/80 bg-red-50/95 text-red-900 shadow-sm dark:border-red-500/30 dark:bg-red-500/12 dark:text-red-100',
        className,
      )}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <p className="flex-1 text-sm leading-6">{feedback.message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label={t('common.actions.close')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
