import { describe, expect, it } from 'vitest';

import { DB_SCHEMA_MIGRATIONS } from '../dbSchema';

describe('db schema registry', () => {
  it('registers only the current schema baseline', () => {
    expect(DB_SCHEMA_MIGRATIONS).toHaveLength(1);
    expect(DB_SCHEMA_MIGRATIONS[0]).toMatchObject({
      description: expect.any(String),
      scope: 'db-schema',
      version: 5,
    });
  });

  it('requires retire metadata for the remaining schema baseline', () => {
    for (const migration of DB_SCHEMA_MIGRATIONS) {
      expect(migration.retireWhen.condition).toBeTruthy();
    }
  });
});
