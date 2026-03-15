import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '../utils/cn';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'zh', name: '简体中文' },
    { code: 'en', name: 'English' },
  ];

  const currentLanguage = languages.find(lang => i18n.language.startsWith(lang.code)) || languages[1];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full hover:bg-muted-bg transition-colors text-text-secondary hover:text-text-primary flex items-center gap-1"
        title="Switch Language"
      >
        <Languages className="w-5 h-5" />
        <span className="text-xs font-medium uppercase hidden sm:inline-block">
          {currentLanguage.code}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-32 glass rounded-xl shadow-2xl border border-border-color/20 py-1 z-[60] animate-fade-in">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => toggleLanguage(lang.code)}
              className={cn(
                "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-muted-bg",
                i18n.language.startsWith(lang.code) ? "text-accent font-medium" : "text-text-primary"
              )}
            >
              {lang.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
