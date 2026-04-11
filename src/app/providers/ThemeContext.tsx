/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import {
  ensureAppThemeHydrated,
  toggleAppTheme,
  type AppTheme,
  useAppThemeSelector,
} from '@shared/stores/appThemeStore';

interface ThemeContextType {
  theme: AppTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppThemeSelector((state) => state.theme);

  useEffect(() => {
    ensureAppThemeHydrated();
  }, []);

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    toggleTheme: toggleAppTheme,
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
