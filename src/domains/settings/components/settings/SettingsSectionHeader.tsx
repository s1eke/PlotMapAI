import type { ReactNode } from 'react';

interface SettingsSectionHeaderProps {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}

export default function SettingsSectionHeader({
  title,
  subtitle,
  actions,
}: SettingsSectionHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-text-primary min-w-0 truncate flex-1">{title}</h2>
        {actions && (
          <div className="shrink-0 self-start flex items-start">
            {actions}
          </div>
        )}
      </div>
      <p className="text-sm text-text-secondary leading-6 max-w-2xl">{subtitle}</p>
    </div>
  );
}
