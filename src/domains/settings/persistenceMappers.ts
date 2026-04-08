import type { PurificationRuleRecord, TocRuleRecord } from '@infra/db/settings';

import type { PurificationRule, TocRule } from './types';

export function mapTocRuleRecordToDomain(rule: TocRuleRecord): TocRule {
  return {
    id: rule.id,
    name: rule.name,
    rule: rule.rule,
    example: rule.example,
    priority: rule.serialNumber,
    isEnabled: rule.enable,
    isDefault: rule.isDefault,
    createdAt: rule.createdAt,
  };
}

export function mapPurificationRuleRecordToDomain(
  rule: PurificationRuleRecord,
): PurificationRule {
  return {
    id: rule.id,
    externalId: rule.externalId ?? undefined,
    name: rule.name,
    group: rule.group,
    pattern: rule.pattern,
    replacement: rule.replacement,
    isRegex: rule.isRegex,
    isEnabled: rule.isEnabled,
    order: rule.order,
    targetScope: rule.targetScope,
    executionStage: rule.executionStage,
    ruleVersion: rule.ruleVersion,
    bookScope: rule.bookScope || undefined,
    excludeBookScope: rule.excludeBookScope || undefined,
    exclusiveGroup: rule.exclusiveGroup || undefined,
    isDefault: rule.isDefault,
    timeoutMs: rule.timeoutMs,
    createdAt: rule.createdAt,
  };
}
