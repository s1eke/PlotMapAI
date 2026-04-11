import { cacheStorage } from './cache';
import { primaryStorage } from './primary';
import { secureStorage } from './secure';

export const storage = {
  primary: primaryStorage,
  cache: cacheStorage,
  secure: secureStorage,
};

export { APP_SETTING_KEYS, CACHE_KEYS, SECURE_KEYS } from './keys';
