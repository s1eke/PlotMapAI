import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';
import { APP_SETTING_KEYS, CACHE_KEYS, storage } from '@infra/storage';
import { readReaderStateCacheSnapshot } from '@infra/storage/readerStateCache';

import {
  ensureReaderAppearanceHydrated,
  flushReaderAppearancePersistence,
  getReaderAppearanceSnapshot,
  resetReaderAppearanceStoreForTests,
  setReaderAppearanceNovelId,
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
    await storage.primary.settings.set(APP_SETTING_KEYS.readerTheme, 'night');

    await ensureReaderAppearanceHydrated();

    expect(getReaderAppearanceSnapshot().readerTheme).toBe('night');
  });

  it('persists the theme to cache and primary storage when updated', async () => {
    setReaderAppearanceTheme('paper');

    expect(storage.cache.getString(CACHE_KEYS.readerTheme)).toBe('paper');

    await flushReaderAppearancePersistence();

    await expect(
      storage.primary.settings.get(APP_SETTING_KEYS.readerTheme),
    ).resolves.toBe('paper');
  });

  it('mirrors the theme into the active reader-state cache snapshot', () => {
    setReaderAppearanceNovelId(12);
    setReaderAppearanceTheme('green');

    expect(readReaderStateCacheSnapshot(12)?.readerTheme).toBe('green');
  });

  it('resets back to the cached theme for tests', () => {
    storage.cache.set(CACHE_KEYS.readerTheme, 'parchment');

    resetReaderAppearanceStoreForTests();

    expect(getReaderAppearanceSnapshot().readerTheme).toBe('parchment');
  });
});
