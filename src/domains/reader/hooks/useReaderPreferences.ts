import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

import { useCallback, useEffect, useMemo } from 'react';

import { READER_THEMES } from '../constants/readerThemes';
import {
  ensureSessionPreferencesHydrated,
  setReaderPageTurnMode,
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

  const fontSize = useReaderSessionSelector(state => state.fontSize);
  const readerTheme = useReaderSessionSelector(state => state.readerTheme);
  const pageTurnMode = useReaderSessionSelector(state => state.pageTurnMode);
  const lineSpacing = useReaderSessionSelector(state => state.lineSpacing);
  const paragraphSpacing = useReaderSessionSelector(state => state.paragraphSpacing);
  const preferences = useMemo(() => ({
    fontSize,
    readerTheme,
    pageTurnMode,
    lineSpacing,
    paragraphSpacing,
  }), [fontSize, lineSpacing, pageTurnMode, paragraphSpacing, readerTheme]);

  const currentTheme = READER_THEMES[preferences.readerTheme] || READER_THEMES.auto;
  const headerBg = HEADER_BG_MAP[preferences.readerTheme] || HEADER_BG_MAP.auto;

  const handleSetFontSize = useCallback((fontSize: number) => {
    setTypography({ fontSize });
  }, []);

  const handleSetReaderTheme = useCallback((readerTheme: string) => {
    setReaderTheme(readerTheme);
  }, []);

  const handleSetPageTurnMode = useCallback((pageTurnMode: ReaderPageTurnMode) => {
    setReaderPageTurnMode(pageTurnMode);
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
    setPageTurnMode: handleSetPageTurnMode,
    setLineSpacing: handleSetLineSpacing,
    setParagraphSpacing: handleSetParagraphSpacing,
    currentTheme,
    headerBg,
  };
}
