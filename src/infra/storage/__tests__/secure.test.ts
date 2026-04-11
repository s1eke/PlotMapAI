import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_KEY_STORAGE_KEY } from '../keys';
import { secureStorage } from '../secure';

describe('secureStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    secureStorage.resetForTesting();
  });

  it('encrypts and decrypts stored values', async () => {
    await secureStorage.set('secure-key', 'super-secret');

    expect(localStorage.getItem('secure-key')).not.toBe('super-secret');
    expect(await secureStorage.get('secure-key')).toBe('super-secret');
  });

  it('reuses the device key across writes', async () => {
    await secureStorage.set('first-key', 'one');
    const storedDeviceKey = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);

    await secureStorage.set('second-key', 'two');

    expect(localStorage.getItem(DEVICE_KEY_STORAGE_KEY)).toBe(storedDeviceKey);
    expect(await secureStorage.get('second-key')).toBe('two');
  });

  it('keeps same-session secrets readable even if the device key disappears temporarily', async () => {
    await secureStorage.set('session-key', 'live-secret');

    localStorage.removeItem(DEVICE_KEY_STORAGE_KEY);

    await expect(secureStorage.get('session-key')).resolves.toBe('live-secret');
  });

  it('returns null without deleting corrupted ciphertext', async () => {
    localStorage.setItem('broken-secure-key', 'bad-payload');

    await expect(secureStorage.get('broken-secure-key')).resolves.toBeNull();
    expect(localStorage.getItem('broken-secure-key')).toBe('bad-payload');
  });
});
