import { db } from '@infra/db';

const settings = {
  async get<T>(key: string): Promise<T | null> {
    const record = await db.appSettings.get(key);
    return (record?.value as T | undefined) ?? null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await db.appSettings.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  },

  async remove(key: string): Promise<void> {
    await db.appSettings.delete(key);
  },
};

export const primaryStorage = {
  settings,
};
