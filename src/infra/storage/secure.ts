import { AppErrorCode, createAppError } from '@shared/errors';
import { DEVICE_KEY_STORAGE_KEY } from './keys';

let deviceCryptoKey: CryptoKey | null = null;
let deviceKeyPromise: Promise<CryptoKey> | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(raw: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(raw);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

async function getDeviceCryptoKey(): Promise<CryptoKey> {
  if (deviceCryptoKey) return deviceCryptoKey;
  if (deviceKeyPromise) return deviceKeyPromise;

  deviceKeyPromise = (async (): Promise<CryptoKey> => {
    if (!isBrowser()) {
      throw createAppError({
        code: AppErrorCode.STORAGE_SECURE_UNAVAILABLE,
        kind: 'storage',
        source: 'storage',
        debugMessage: 'Secure storage is unavailable outside the browser',
        userMessageKey: 'errors.STORAGE_SECURE_UNAVAILABLE',
      });
    }

    const existing = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);
    if (existing) {
      deviceCryptoKey = await crypto.subtle.importKey(
        'raw',
        fromB64(existing),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );
      return deviceCryptoKey;
    }

    const nextKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const exported = await crypto.subtle.exportKey('raw', nextKey);
    localStorage.setItem(DEVICE_KEY_STORAGE_KEY, toB64(new Uint8Array(exported)));
    deviceCryptoKey = nextKey;
    return nextKey;
  })().catch((error: unknown) => {
    deviceKeyPromise = null;
    throw error;
  });

  return deviceKeyPromise;
}

async function encrypt(value: string): Promise<string> {
  const key = await getDeviceCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${toB64(iv)}.${toB64(new Uint8Array(ciphertext))}`;
}

async function decrypt(payload: string): Promise<string> {
  const dotIndex = payload.indexOf('.');
  if (dotIndex < 0) {
    throw createAppError({
      code: AppErrorCode.STORAGE_ENCRYPTED_PAYLOAD_INVALID,
      kind: 'storage',
      source: 'storage',
      debugMessage: 'Invalid encrypted payload',
      userMessageKey: 'errors.STORAGE_ENCRYPTED_PAYLOAD_INVALID',
    });
  }

  const key = await getDeviceCryptoKey();
  const iv = fromB64(payload.slice(0, dotIndex));
  const ciphertext = fromB64(payload.slice(dotIndex + 1));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function get(key: string): Promise<string | null> {
  if (!isBrowser()) return null;
  const payload = localStorage.getItem(key);
  if (!payload) return null;

  try {
    return await decrypt(payload);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

async function set(key: string, value: string): Promise<void> {
  if (!isBrowser()) return;
  const payload = await encrypt(value);
  localStorage.setItem(key, payload);
}

async function remove(key: string): Promise<void> {
  if (!isBrowser()) return;
  localStorage.removeItem(key);
}

function resetForTesting(): void {
  deviceCryptoKey = null;
  deviceKeyPromise = null;
}

export const secureStorage = {
  get,
  set,
  remove,
  resetForTesting,
};
