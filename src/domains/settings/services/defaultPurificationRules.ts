import { db } from '@infra/db';
import { CURRENT_PURIFICATION_RULE_VERSION } from '@shared/text-processing';

import type { PurificationRuleRecord } from '@infra/db/settings';
import type {
  PurificationExecutionStage,
  PurificationTargetScope,
} from '@shared/text-processing';

import { loadYaml } from './yaml';

interface DefaultPurificationRuleRecord {
  externalId: number;
  name: string;
  group: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  isEnabled: boolean;
  order: number;
  targetScope: PurificationTargetScope;
  executionStage: PurificationExecutionStage;
  exclusiveGroup?: string;
  timeoutMs?: number;
}

async function loadDefaultPurificationRules(): Promise<DefaultPurificationRuleRecord[]> {
  const [{ default: defaultPurificationRulesRaw }] = await Promise.all([
    import('./defaultPurificationRules.yaml?raw'),
  ]);

  return loadYaml<DefaultPurificationRuleRecord[]>(defaultPurificationRulesRaw);
}

function mapDefaultPurificationRule(
  rule: DefaultPurificationRuleRecord,
  createdAt: string,
): Omit<PurificationRuleRecord, 'id'> {
  return {
    externalId: rule.externalId,
    name: rule.name,
    group: rule.group,
    pattern: rule.pattern,
    replacement: rule.replacement,
    isRegex: rule.isRegex,
    isEnabled: rule.isEnabled,
    order: rule.order,
    targetScope: rule.targetScope,
    executionStage: rule.executionStage,
    ruleVersion: CURRENT_PURIFICATION_RULE_VERSION,
    bookScope: '',
    excludeBookScope: '',
    exclusiveGroup: rule.exclusiveGroup ?? '',
    isDefault: true,
    timeoutMs: rule.timeoutMs ?? 3000,
    createdAt,
  };
}

export async function ensureDefaultPurificationRules(): Promise<void> {
  const defaultRules = await loadDefaultPurificationRules();
  if (defaultRules.length === 0) {
    return;
  }

  const existingRules = await db.purificationRules.toArray();
  const existingExternalIds = new Set(
    existingRules
      .map((rule) => rule.externalId)
      .filter((externalId): externalId is number => typeof externalId === 'number'),
  );

  const createdAt = new Date().toISOString();
  for (const rule of defaultRules) {
    if (existingExternalIds.has(rule.externalId)) {
      const existingRule = existingRules.find(
        (candidate) => candidate.externalId === rule.externalId,
      );
      if (existingRule) {
        await db.purificationRules.update(existingRule.id, {
          isDefault: true,
          exclusiveGroup: rule.exclusiveGroup ?? '',
          targetScope: rule.targetScope,
          executionStage: rule.executionStage,
          ruleVersion: CURRENT_PURIFICATION_RULE_VERSION,
        });
      }
      continue;
    }

    await db.purificationRules.add({
      ...mapDefaultPurificationRule(rule, createdAt),
    });
  }
}
