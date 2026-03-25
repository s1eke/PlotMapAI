import { Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../providers/ThemeContext';

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full hover:bg-white/10 transition-colors text-text-secondary hover:text-text-primary"
      title={theme === 'dark' ? t('common.theme.light') : t('common.theme.dark')}
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5 text-gold-400" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
}
