interface CacheEnvelope<T> {
  __plotmapaiStorage: true;
  expiresAt: number | null;
  value: T;
}

interface CacheSetOptions {
  ttlMs?: number;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isEnvelope(value: unknown): value is CacheEnvelope<unknown> {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as Record<string, unknown>).__plotmapaiStorage === true,
  );
}

function hasExpired(expiresAt: number | null): boolean {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && Date.now() >= expiresAt;
}

function readRaw(key: string): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(key);
}

function remove(key: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(key);
}

function parseEnvelope<T>(key: string): CacheEnvelope<T> | null {
  const raw = readRaw(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isEnvelope(parsed)) return null;
    if (hasExpired(parsed.expiresAt)) {
      remove(key);
      return null;
    }
    return parsed as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

function setWithEnvelope<T>(key: string, value: T, ttlMs: number): void {
  if (!isBrowser()) return;
  const payload: CacheEnvelope<T> = {
    __plotmapaiStorage: true,
    expiresAt: Date.now() + ttlMs,
    value,
  };
  localStorage.setItem(key, JSON.stringify(payload));
}

function getString(key: string): string | null {
  const envelope = parseEnvelope<string>(key);
  if (envelope) {
    return typeof envelope.value === 'string' ? envelope.value : null;
  }

  return readRaw(key);
}

function getJson<T>(key: string): T | null {
  const envelope = parseEnvelope<T>(key);
  if (envelope) {
    return envelope.value;
  }

  const raw = readRaw(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    remove(key);
    return null;
  }
}

function set(key: string, value: unknown, options?: CacheSetOptions): void {
  if (!isBrowser()) return;
  if (typeof options?.ttlMs === 'number' && Number.isFinite(options.ttlMs) && options.ttlMs > 0) {
    setWithEnvelope(key, value, options.ttlMs);
    return;
  }

  if (typeof value === 'string') {
    localStorage.setItem(key, value);
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

export const cacheStorage = {
  getJson,
  getString,
  set,
  remove,
};
