import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

import { useCallback, useEffect, useMemo } from 'react';
import {
  useReaderAppearanceSelector,
} from '@shared/stores/readerAppearanceStore';

import { READER_THEMES, type ReaderThemeConfig } from '../constants/readerThemes';
import {
  ensureReaderPreferencesHydrated,
  setReaderPageTurnMode,
  setReaderTheme,
  setTypography,
  useReaderPreferencesSelector,
} from './readerPreferencesStore';

export interface UseReaderPreferencesResult {
  currentTheme: ReaderThemeConfig;
  fontSize: number;
  headerBg: string;
  lineSpacing: number;
  pageTurnMode: ReaderPageTurnMode;
  paragraphSpacing: number;
  readerTheme: string;
  setFontSize: (nextFontSize: number) => void;
  setLineSpacing: (nextLineSpacing: number) => void;
  setPageTurnMode: (nextPageTurnMode: ReaderPageTurnMode) => void;
  setParagraphSpacing: (nextParagraphSpacing: number) => void;
  setReaderTheme: (nextReaderTheme: string) => void;
}

export function useReaderPreferences(): UseReaderPreferencesResult {
  useEffect(() => {
    ensureReaderPreferencesHydrated().catch(() => undefined);
  }, []);

  const fontSize = useReaderPreferencesSelector((state) => state.fontSize);
  const readerTheme = useReaderAppearanceSelector((state) => state.readerTheme);
  const pageTurnMode = useReaderPreferencesSelector((state) => state.pageTurnMode);
  const lineSpacing = useReaderPreferencesSelector((state) => state.lineSpacing);
  const paragraphSpacing = useReaderPreferencesSelector((state) => state.paragraphSpacing);
  const preferences = useMemo(() => ({
    fontSize,
    readerTheme,
    pageTurnMode,
    lineSpacing,
    paragraphSpacing,
  }), [fontSize, lineSpacing, pageTurnMode, paragraphSpacing, readerTheme]);

  const currentTheme =
    READER_THEMES[preferences.readerTheme as keyof typeof READER_THEMES]
    || READER_THEMES.auto;
  const { headerBg } = currentTheme;

  const handleSetFontSize = useCallback((nextFontSize: number) => {
    setTypography({ fontSize: nextFontSize });
  }, []);

  const handleSetReaderTheme = useCallback((nextReaderTheme: string) => {
    setReaderTheme(nextReaderTheme);
  }, []);

  const handleSetPageTurnMode = useCallback((nextPageTurnMode: ReaderPageTurnMode) => {
    setReaderPageTurnMode(nextPageTurnMode);
  }, []);

  const handleSetLineSpacing = useCallback((nextLineSpacing: number) => {
    setTypography({ lineSpacing: nextLineSpacing });
  }, []);

  const handleSetParagraphSpacing = useCallback((nextParagraphSpacing: number) => {
    setTypography({ paragraphSpacing: nextParagraphSpacing });
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
