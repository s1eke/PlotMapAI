import { useCallback, useEffect } from 'react';
import { READER_THEMES } from '../constants/readerThemes';
import {
  ensureSessionPreferencesHydrated,
  setReaderTheme,
  setTypography,
  useReaderSessionSelector,
} from './sessionStore';

const HEADER_BG_MAP: Record<string, string> = {
  auto: 'bg-bg-primary',
  paper: 'bg-white',
  parchment: 'bg-[#f4ecd8]',
  green: 'bg-[#c7edcc]',
  night: 'bg-[#1a1a1a]',
};

export function useReaderPreferences() {
  useEffect(() => {
    void ensureSessionPreferencesHydrated();
  }, []);

  const preferences = useReaderSessionSelector(state => ({
    fontSize: state.fontSize,
    readerTheme: state.readerTheme,
    lineSpacing: state.lineSpacing,
    paragraphSpacing: state.paragraphSpacing,
  }));

  const currentTheme = READER_THEMES[preferences.readerTheme] || READER_THEMES.auto;
  const headerBg = HEADER_BG_MAP[preferences.readerTheme] || HEADER_BG_MAP.auto;

  const handleSetFontSize = useCallback((fontSize: number) => {
    setTypography({ fontSize });
  }, []);

  const handleSetReaderTheme = useCallback((readerTheme: string) => {
    setReaderTheme(readerTheme);
  }, []);

  const handleSetLineSpacing = useCallback((lineSpacing: number) => {
    setTypography({ lineSpacing });
  }, []);

  const handleSetParagraphSpacing = useCallback((paragraphSpacing: number) => {
    setTypography({ paragraphSpacing });
  }, []);

  return {
    ...preferences,
    setFontSize: handleSetFontSize,
    setReaderTheme: handleSetReaderTheme,
    setLineSpacing: handleSetLineSpacing,
    setParagraphSpacing: handleSetParagraphSpacing,
    currentTheme,
    headerBg,
  };
}
