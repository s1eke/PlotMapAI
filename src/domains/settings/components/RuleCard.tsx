import { Trash2, Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Toggle from '@shared/components/Toggle';

interface RuleCardProps {
  name: string;
  pattern: string;
  isEnabled: boolean;
  priority?: number;
  isDefault?: boolean;
  group?: string;
  type?: 'regex' | 'text';
  scopes?: string[];
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete?: () => void;
  isCustom?: boolean;
}

export default function RuleCard({
  name,
  pattern,
  isEnabled,
  priority,
  isDefault,
  group,
  type,
  scopes,
  onToggle,
  onEdit,
  onDelete,
  isCustom = true
}: RuleCardProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-card-bg border border-border-color/30 rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-text-primary truncate" title={name}>{name}</h4>
            {isDefault && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-muted-bg text-text-secondary rounded border border-border-color/50 shrink-0">
                {t('settings.toc.default')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-secondary opacity-70">
            {priority !== undefined && (
              <span className="uppercase tracking-wider">
                {group ? t('settings.purification.order') : t('settings.toc.serial')}: {priority}
              </span>
            )}
            {priority !== undefined && (type || scopes?.length || group) && <span>•</span>}
            {type && <span className="uppercase tracking-wider">{type === 'regex' ? t('settings.purification.useRegex') : 'TEXT'}</span>}
            {scopes && scopes.map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded bg-white/5">{s}</span>
            ))}
          </div>
        </div>
        <Toggle
          checked={isEnabled}
          onChange={onToggle}
        />
      </div>
      
      <code className="text-xs text-accent font-mono bg-muted-bg px-2 py-1.5 rounded block w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap border border-border-color/20" title={pattern}>
        {pattern}
      </code>

      <div className="flex items-center justify-end gap-1 mt-1 border-t border-white/5 pt-3">
        <button
          onClick={onEdit}
          className="p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
          title="Edit"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        {isCustom && onDelete && (
          <button
            onClick={onDelete}
            className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
