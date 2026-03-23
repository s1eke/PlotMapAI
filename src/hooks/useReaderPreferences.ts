import { useState, useEffect, useCallback } from 'react';
import { READER_THEMES } from '../constants/readerThemes';

const HEADER_BG_MAP: Record<string, string> = {
  auto: 'bg-bg-primary',
  paper: 'bg-white',
  parchment: 'bg-[#f4ecd8]',
  green: 'bg-[#c7edcc]',
  night: 'bg-[#1a1a1a]',
};

export function useReaderPreferences() {
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('readerFontSize');
    return saved ? Number(saved) : 18;
  });
  const [readerTheme, setReaderTheme] = useState<string>(() => localStorage.getItem('readerTheme') || 'auto');
  const [lineSpacing, setLineSpacing] = useState<number>(() => {
    const saved = localStorage.getItem('readerLineSpacing');
    return saved ? Number(saved) : 1.8;
  });
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(() => {
    const saved = localStorage.getItem('readerParagraphSpacing');
    return saved ? Number(saved) : 16;
  });

  useEffect(() => {
    localStorage.setItem('readerFontSize', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('readerTheme', readerTheme);
  }, [readerTheme]);

  useEffect(() => {
    localStorage.setItem('readerLineSpacing', String(lineSpacing));
  }, [lineSpacing]);

  useEffect(() => {
    localStorage.setItem('readerParagraphSpacing', String(paragraphSpacing));
  }, [paragraphSpacing]);

  const currentTheme = READER_THEMES[readerTheme] || READER_THEMES.auto;
  const headerBg = HEADER_BG_MAP[readerTheme] || HEADER_BG_MAP.auto;

  const handleSetFontSize = useCallback((v: number) => setFontSize(v), []);
  const handleSetReaderTheme = useCallback((v: string) => setReaderTheme(v), []);
  const handleSetLineSpacing = useCallback((v: number) => setLineSpacing(v), []);
  const handleSetParagraphSpacing = useCallback((v: number) => setParagraphSpacing(v), []);

  return {
    fontSize,
    setFontSize: handleSetFontSize,
    readerTheme,
    setReaderTheme: handleSetReaderTheme,
    lineSpacing,
    setLineSpacing: handleSetLineSpacing,
    paragraphSpacing,
    setParagraphSpacing: handleSetParagraphSpacing,
    currentTheme,
    headerBg,
  };
}
