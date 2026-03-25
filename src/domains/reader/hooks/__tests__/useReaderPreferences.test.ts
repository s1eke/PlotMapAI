import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_SETTING_KEYS, storage } from '@infra/storage';
import { useReaderPreferences } from '../useReaderPreferences';
import { READER_THEMES } from '../../constants/readerThemes';
import { resetReaderSessionStoreForTests } from '../sessionStore';
import { db } from '@infra/db';

describe('useReaderPreferences', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('returns default values when localStorage is empty', () => {
    const { result } = renderHook(() => useReaderPreferences());

    expect(result.current.fontSize).toBe(18);
    expect(result.current.readerTheme).toBe('auto');
    expect(result.current.lineSpacing).toBe(1.8);
    expect(result.current.paragraphSpacing).toBe(16);
    expect(result.current.currentTheme).toEqual(READER_THEMES.auto);
    expect(result.current.headerBg).toBe('bg-bg-primary');
  });

  it('reads saved fontSize from localStorage', () => {
    localStorage.setItem('readerFontSize', '24');
    resetReaderSessionStoreForTests();
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.fontSize).toBe(24);
  });

  it('reads saved readerTheme from localStorage', () => {
    localStorage.setItem('readerTheme', 'night');
    resetReaderSessionStoreForTests();
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.readerTheme).toBe('night');
    expect(result.current.currentTheme).toEqual(READER_THEMES.night);
  });

  it('reads saved lineSpacing from localStorage', () => {
    localStorage.setItem('readerLineSpacing', '2.0');
    resetReaderSessionStoreForTests();
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.lineSpacing).toBe(2.0);
  });

  it('reads saved paragraphSpacing from localStorage', () => {
    localStorage.setItem('readerParagraphSpacing', '20');
    resetReaderSessionStoreForTests();
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.paragraphSpacing).toBe(20);
  });

  it('persists fontSize to localStorage on update', () => {
    const { result } = renderHook(() => useReaderPreferences());
    act(() => { result.current.setFontSize(22); });
    expect(result.current.fontSize).toBe(22);
    expect(localStorage.getItem('readerFontSize')).toBe('22');
  });

  it('persists readerTheme to localStorage on update', () => {
    const { result } = renderHook(() => useReaderPreferences());
    act(() => { result.current.setReaderTheme('green'); });
    expect(result.current.readerTheme).toBe('green');
    expect(localStorage.getItem('readerTheme')).toBe('green');
  });

  it('persists lineSpacing to localStorage on update', () => {
    const { result } = renderHook(() => useReaderPreferences());
    act(() => { result.current.setLineSpacing(2.5); });
    expect(result.current.lineSpacing).toBe(2.5);
    expect(localStorage.getItem('readerLineSpacing')).toBe('2.5');
  });

  it('persists paragraphSpacing to localStorage on update', () => {
    const { result } = renderHook(() => useReaderPreferences());
    act(() => { result.current.setParagraphSpacing(24); });
    expect(result.current.paragraphSpacing).toBe(24);
    expect(localStorage.getItem('readerParagraphSpacing')).toBe('24');
  });

  it('computes currentTheme for known themes', () => {
    const { result } = renderHook(() => useReaderPreferences());
    act(() => { result.current.setReaderTheme('paper'); });
    expect(result.current.currentTheme).toEqual(READER_THEMES.paper);
    act(() => { result.current.setReaderTheme('parchment'); });
    expect(result.current.currentTheme).toEqual(READER_THEMES.parchment);
  });

  it('falls back to auto theme for unknown theme key', () => {
    localStorage.setItem('readerTheme', 'nonexistent');
    resetReaderSessionStoreForTests();
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.currentTheme).toEqual(READER_THEMES.auto);
  });

  it('computes headerBg for each theme', () => {
    const { result } = renderHook(() => useReaderPreferences());

    act(() => { result.current.setReaderTheme('auto'); });
    expect(result.current.headerBg).toBe('bg-bg-primary');

    act(() => { result.current.setReaderTheme('paper'); });
    expect(result.current.headerBg).toBe('bg-white');

    act(() => { result.current.setReaderTheme('parchment'); });
    expect(result.current.headerBg).toBe('bg-[#f4ecd8]');

    act(() => { result.current.setReaderTheme('green'); });
    expect(result.current.headerBg).toBe('bg-[#c7edcc]');

    act(() => { result.current.setReaderTheme('night'); });
    expect(result.current.headerBg).toBe('bg-[#1a1a1a]');
  });

  it('falls back headerBg to auto for unknown theme', () => {
    localStorage.setItem('readerTheme', 'unknown');
    resetReaderSessionStoreForTests();
    const { result } = renderHook(() => useReaderPreferences());
    expect(result.current.headerBg).toBe('bg-bg-primary');
  });

  it('hydrates reader preferences from primary storage when cache is empty', async () => {
    await storage.primary.settings.set(APP_SETTING_KEYS.readerTheme, 'paper');
    await storage.primary.settings.set(APP_SETTING_KEYS.readerFontSize, 23);
    await storage.primary.settings.set(APP_SETTING_KEYS.readerLineSpacing, 2.2);
    await storage.primary.settings.set(APP_SETTING_KEYS.readerParagraphSpacing, 20);

    const { result } = renderHook(() => useReaderPreferences());

    await waitFor(() => {
      expect(result.current.readerTheme).toBe('paper');
      expect(result.current.fontSize).toBe(23);
      expect(result.current.lineSpacing).toBe(2.2);
      expect(result.current.paragraphSpacing).toBe(20);
    });
  });
});
