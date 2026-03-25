import { cn } from '@shared/utils/cn';
import type { SettingsTabId } from '../../utils/settingsPage';

interface SettingsTabBarItem {
  id: SettingsTabId;
  label: string;
}

interface SettingsTabBarProps {
  activeTab: SettingsTabId;
  items: SettingsTabBarItem[];
  onChange: (tab: SettingsTabId) => void;
}

export default function SettingsTabBar({
  activeTab,
  items,
  onChange,
}: SettingsTabBarProps) {
  return (
    <div className="flex space-x-1 glass p-1 rounded-xl w-full sm:w-fit shrink-0">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'flex-1 sm:flex-none px-3 sm:px-6 py-2.5 rounded-lg text-sm font-medium transition-all',
            activeTab === item.id
              ? 'bg-brand-700 shadow text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-white/5',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
