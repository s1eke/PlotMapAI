import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@infra/db';
import { ensureDefaultTocRules } from '../defaultTocRules';

describe('ensureDefaultTocRules', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('populates rules on empty DB', async () => {
    const countBefore = await db.tocRules.count();
    expect(countBefore).toBe(0);
    await ensureDefaultTocRules();
    const countAfter = await db.tocRules.count();
    expect(countAfter).toBeGreaterThan(0);
  });

  it('does not duplicate rules', async () => {
    await ensureDefaultTocRules();
    const count1 = await db.tocRules.count();
    await ensureDefaultTocRules();
    const count2 = await db.tocRules.count();
    expect(count2).toBe(count1);
  });
});
