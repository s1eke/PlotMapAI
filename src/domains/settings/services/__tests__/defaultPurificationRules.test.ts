import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';

import { ensureDefaultPurificationRules } from '../defaultPurificationRules';

describe('ensureDefaultPurificationRules', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('populates the built-in purification rules when they are missing', async () => {
    await ensureDefaultPurificationRules();

    const rules = await db.purificationRules.orderBy('order').toArray();

    expect(rules).toHaveLength(3);
    expect(rules.map((rule) => rule.name)).toEqual([
      '首行缩进(两格)',
      '首行顶格(无缩进)',
      '删除网址',
    ]);
    expect(rules.map((rule) => rule.isEnabled)).toEqual([true, false, true]);
    expect(rules.every((rule) => rule.isDefault)).toBe(true);
  });

  it('adds only missing defaults without duplicating existing ones', async () => {
    await db.purificationRules.add({
      id: undefined as unknown as number,
      externalId: 1,
      name: '首行缩进(两格)',
      group: '段落排版',
      pattern: '(^|\\n)[ \\t　]*(?=\\S)',
      replacement: '$1　　',
      isRegex: true,
      isEnabled: true,
      order: 0,
      scopeTitle: false,
      scopeContent: true,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: 'indentation',
      isDefault: false,
      timeoutMs: 3000,
      createdAt: new Date().toISOString(),
    });

    await ensureDefaultPurificationRules();
    await ensureDefaultPurificationRules();

    const rules = await db.purificationRules.orderBy('order').toArray();

    expect(rules).toHaveLength(3);
    expect(rules.filter((rule) => rule.externalId === 1)).toHaveLength(1);
    expect(rules.map((rule) => rule.externalId)).toEqual([1, 2, 3]);
    expect(rules.every((rule) => rule.isDefault)).toBe(true);
  });
});
