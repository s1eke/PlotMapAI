import { describe, expect, it } from 'vitest';

import type { PurificationRuleRecord, TocRuleRecord } from '@infra/db/settings';

import {
  mapPurificationRuleRecordToDomain,
  mapTocRuleRecordToDomain,
} from '../persistenceMappers';

describe('settings persistence mappers', () => {
  it('maps toc rule records into domain rules', () => {
    const record: TocRuleRecord = {
      id: 1,
      name: 'Default',
      rule: '^Chapter',
      example: 'Chapter 1',
      serialNumber: 10,
      enable: true,
      isDefault: true,
      createdAt: '2026-04-01T00:00:00.000Z',
    };

    expect(mapTocRuleRecordToDomain(record)).toEqual({
      id: 1,
      name: 'Default',
      rule: '^Chapter',
      example: 'Chapter 1',
      priority: 10,
      isEnabled: true,
      isDefault: true,
      createdAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('maps purification rule records into domain rules', () => {
    const record: PurificationRuleRecord = {
      id: 2,
      externalId: 9,
      name: 'Cleanup',
      group: 'Purification',
      pattern: 'foo',
      replacement: 'bar',
      isRegex: true,
      isEnabled: true,
      order: 10,
      targetScope: 'all',
      executionStage: 'post-ast',
      ruleVersion: 2,
      bookScope: '',
      excludeBookScope: '',
      exclusiveGroup: '',
      isDefault: false,
      timeoutMs: 3000,
      createdAt: '2026-04-01T00:00:00.000Z',
    };

    expect(mapPurificationRuleRecordToDomain(record)).toMatchObject({
      id: 2,
      externalId: 9,
      name: 'Cleanup',
      pattern: 'foo',
      replacement: 'bar',
      isRegex: true,
      isEnabled: true,
      targetScope: 'all',
      executionStage: 'post-ast',
      ruleVersion: 2,
    });
  });
});
