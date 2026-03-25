import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheStorage } from '../cache';

describe('cacheStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads and writes raw strings', () => {
    cacheStorage.set('plain-text', 'hello');
    expect(cacheStorage.getString('plain-text')).toBe('hello');
  });

  it('reads and writes json payloads', () => {
    cacheStorage.set('json-value', { enabled: true, count: 3 });
    expect(cacheStorage.getJson<{ enabled: boolean; count: number }>('json-value')).toEqual({
      enabled: true,
      count: 3,
    });
  });

  it('expires ttl values', () => {
    cacheStorage.set('ttl-key', { stale: false }, { ttlMs: 1 });
    const now = Date.now();
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now + 5);

    expect(cacheStorage.getJson('ttl-key')).toBeNull();
    expect(localStorage.getItem('ttl-key')).toBeNull();

    dateNowSpy.mockRestore();
  });

  it('removes invalid json payloads', () => {
    localStorage.setItem('broken-json', '{not valid');
    expect(cacheStorage.getJson('broken-json')).toBeNull();
    expect(localStorage.getItem('broken-json')).toBeNull();
  });
});
