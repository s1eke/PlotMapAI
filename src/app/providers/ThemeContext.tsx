/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { ensureSessionPreferencesHydrated, setAppTheme, useReaderSessionSelector, type AppTheme } from '@domains/reader';

interface ThemeContextType {
  theme: AppTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useReaderSessionSelector(state => state.appTheme);

  useEffect(() => {
    void ensureSessionPreferencesHydrated();
  }, []);

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    toggleTheme: () => {
      setAppTheme(theme === 'light' ? 'dark' : 'light');
    },
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
