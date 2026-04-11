import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';
import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';

import { READER_THEMES } from '../../constants/readerThemes';
import { resetReaderSessionStoreForTests } from '@domains/reader-session';
import { useReaderPreferences } from '../useReaderPreferences';

const LEGACY_READER_THEME_CACHE_KEY = 'readerTheme';
const LEGACY_READER_PAGE_TURN_MODE_CACHE_KEY = 'readerPageTurnMode';
const LEGACY_READER_FONT_SIZE_CACHE_KEY = 'readerFontSize';
const LEGACY_READER_LINE_SPACING_CACHE_KEY = 'readerLineSpacing';
const LEGACY_READER_PARAGRAPH_SPACING_CACHE_KEY = 'readerParagraphSpacing';

function setCachedReaderPreferences(
  overrides: Partial<Record<string, unknown>> = {},
): void {
  storage.cache.set(CACHE_KEYS.readerPreferences, {
    version: 1,
    appTheme: 'light',
    readerTheme: 'auto',
    pageTurnMode: 'scroll',
    fontSize: 18,
    lineSpacing: 1.8,
    paragraphSpacing: 16,
    ...overrides,
  });
}

describe('useReaderPreferences', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetReaderSessionStoreForTests();
  });

  it('returns default values when no unified preference snapshot exists', () => {
    const { result } = renderHook(() => useReaderPreferences());

    expect(result.current.fontSize).toBe(18);
    expect(result.current.readerTheme).toBe('auto');
    expect(result.current.pageTurnMode).toBe('scroll');
    expect(result.current.lineSpacing).toBe(1.8);
    expect(result.current.paragraphSpacing).toBe(16);
    expect(result.current.currentTheme).toEqual(READER_THEMES.auto);
    expect(result.current.headerBg).toBe('bg-bg-primary');
  });

  it('hydrates from the unified cached preference snapshot', () => {
    setCachedReaderPreferences({
      readerTheme: 'night',
      pageTurnMode: 'slide',
      fontSize: 24,
      lineSpacing: 2,
      paragraphSpacing: 20,
    });
    resetReaderSessionStoreForTests();

    const { result } = renderHook(() => useReaderPreferences());

    expect(result.current.fontSize).toBe(24);
    expect(result.current.readerTheme).toBe('night');
    expect(result.current.pageTurnMode).toBe('slide');
    expect(result.current.lineSpacing).toBe(2);
    expect(result.current.paragraphSpacing).toBe(20);
    expect(result.current.currentTheme).toEqual(READER_THEMES.night);
  });

  it('does not read legacy split preference keys', () => {
    localStorage.setItem('readerTheme', 'night');
    localStorage.setItem('readerPageTurnMode', 'slide');
    localStorage.setItem('readerFontSize', '24');
    resetReaderSessionStoreForTests();

    const { result } = renderHook(() => useReaderPreferences());

    expect(result.current.readerTheme).toBe('auto');
    expect(result.current.pageTurnMode).toBe('scroll');
    expect(result.current.fontSize).toBe(18);
  });

  it('persists updates to the unified preference snapshot only', () => {
    const { result } = renderHook(() => useReaderPreferences());

    act(() => {
      result.current.setFontSize(22);
      result.current.setReaderTheme('green');
      result.current.setPageTurnMode('cover');
      result.current.setLineSpacing(2.5);
      result.current.setParagraphSpacing(24);
    });

    expect(result.current.fontSize).toBe(22);
    expect(result.current.readerTheme).toBe('green');
    expect(result.current.pageTurnMode).toBe('cover');
    expect(result.current.lineSpacing).toBe(2.5);
    expect(result.current.paragraphSpacing).toBe(24);
    expect(storage.cache.getJson(CACHE_KEYS.readerPreferences)).toEqual({
      version: 1,
      appTheme: 'light',
      readerTheme: 'green',
      pageTurnMode: 'cover',
      fontSize: 22,
      lineSpacing: 2.5,
      paragraphSpacing: 24,
    });
    expect(localStorage.getItem(LEGACY_READER_THEME_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_READER_PAGE_TURN_MODE_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_READER_FONT_SIZE_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_READER_LINE_SPACING_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_READER_PARAGRAPH_SPACING_CACHE_KEY)).toBeNull();
  });

  it('falls back to the auto theme when the theme key is unknown', () => {
    setCachedReaderPreferences({ readerTheme: 'nonexistent' });
    resetReaderSessionStoreForTests();

    const { result } = renderHook(() => useReaderPreferences());

    expect(result.current.currentTheme).toEqual(READER_THEMES.auto);
    expect(result.current.headerBg).toBe('bg-bg-primary');
  });

  it('hydrates reader preferences from unified primary storage when cache is empty', async () => {
    await storage.primary.settings.set(APP_SETTING_KEYS.readerPreferences, {
      version: 1,
      appTheme: 'light',
      readerTheme: 'paper',
      pageTurnMode: 'none',
      fontSize: 23,
      lineSpacing: 2.2,
      paragraphSpacing: 20,
    });

    const { result } = renderHook(() => useReaderPreferences());

    await waitFor(() => {
      expect(result.current.readerTheme).toBe('paper');
      expect(result.current.pageTurnMode).toBe('none');
      expect(result.current.fontSize).toBe(23);
      expect(result.current.lineSpacing).toBe(2.2);
      expect(result.current.paragraphSpacing).toBe(20);
    });
  });
});
