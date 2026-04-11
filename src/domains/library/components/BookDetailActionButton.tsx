import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Loader2 } from 'lucide-react';
import { cn } from '@shared/utils/cn';

export type BookDetailActionButtonTone = 'neutral' | 'brand' | 'brand-soft' | 'warning' | 'danger';

export interface BookDetailActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: BookDetailActionButtonTone;
}

export const PRIMARY_DETAIL_ACTION_CLASS = 'flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';

const TONE_CLASS_NAMES: Record<BookDetailActionButtonTone, string> = {
  neutral: 'bg-[#5f6b79] hover:bg-[#53606f]',
  brand: 'bg-brand-700 hover:bg-brand-600',
  'brand-soft': 'bg-[#586a84] hover:bg-[#4d5f79]',
  warning: 'bg-[#b07b1e] hover:bg-[#9b6b17]',
  danger: 'bg-[#a14a47] hover:bg-[#8d403d]',
};

export default function BookDetailActionButton({
  icon: Icon,
  label,
  onClick,
  loading = false,
  disabled = false,
  tone = 'neutral',
}: BookDetailActionButtonProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(PRIMARY_DETAIL_ACTION_CLASS, TONE_CLASS_NAMES[tone])}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      <span className="tracking-[0.01em]">{label}</span>
    </button>
  );
}
