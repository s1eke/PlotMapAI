import type { ReactNode } from 'react';

interface SettingsEmptyStateProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export default function SettingsEmptyState({
  title,
  description,
  actions,
}: SettingsEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-muted-bg/30 px-6 py-10 text-center space-y-3">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary max-w-xl mx-auto leading-6">{description}</p>
      </div>
      {actions && <div className="flex justify-center pt-2">{actions}</div>}
    </div>
  );
}
