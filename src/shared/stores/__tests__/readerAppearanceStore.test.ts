import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';
import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { readReaderBootstrapSnapshot } from '@infra/storage/readerStateCache';

import {
  ensureReaderAppearanceHydrated,
  flushReaderAppearancePersistence,
  getReaderAppearanceSnapshot,
  resetReaderAppearanceStoreForTests,
  setReaderAppearanceTheme,
} from '../readerAppearanceStore';

describe('readerAppearanceStore', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    resetReaderAppearanceStoreForTests();
  });

  it('uses the auto theme by default', () => {
    expect(getReaderAppearanceSnapshot().readerTheme).toBe('auto');
  });

  it('hydrates the reader theme from primary storage', async () => {
    await storage.primary.settings.set(APP_SETTING_KEYS.readerPreferences, {
      version: 1,
      appTheme: 'light',
      readerTheme: 'night',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });

    await ensureReaderAppearanceHydrated();

    expect(getReaderAppearanceSnapshot().readerTheme).toBe('night');
  });

  it('persists the theme to the unified preference snapshot', async () => {
    setReaderAppearanceTheme('paper');

    expect(storage.cache.getJson(CACHE_KEYS.readerPreferences)).toEqual({
      version: 1,
      appTheme: 'light',
      readerTheme: 'paper',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });

    await flushReaderAppearancePersistence();

    await expect(
      storage.primary.settings.get(APP_SETTING_KEYS.readerPreferences),
    ).resolves.toEqual({
      version: 1,
      appTheme: 'light',
      readerTheme: 'paper',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });
  });

  it('does not mirror the theme into the reader bootstrap snapshot', () => {
    setReaderAppearanceTheme('green');

    expect(readReaderBootstrapSnapshot(12)).toBeNull();
  });

  it('resets back to the cached theme for tests', () => {
    storage.cache.set(CACHE_KEYS.readerPreferences, {
      version: 1,
      appTheme: 'light',
      readerTheme: 'parchment',
      pageTurnMode: 'scroll',
      fontSize: 18,
      lineSpacing: 1.8,
      paragraphSpacing: 16,
    });

    resetReaderAppearanceStoreForTests();

    expect(getReaderAppearanceSnapshot().readerTheme).toBe('parchment');
  });
});
