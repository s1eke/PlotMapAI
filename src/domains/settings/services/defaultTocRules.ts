import type { TocRule } from '@infra/db';
import { db } from '@infra/db';
import { loadYaml } from './yaml';

interface DefaultTocRuleRecord {
  name: string;
  rule: string;
  example: string;
  serialNumber: number;
  enable: boolean;
}

async function loadDefaultTocRules(): Promise<DefaultTocRuleRecord[]> {
  const [{ default: defaultTocRulesRaw }] = await Promise.all([
    import('./defaultTocRules.yaml?raw'),
  ]);

  return loadYaml<DefaultTocRuleRecord[]>(defaultTocRulesRaw);
}

function mapDefaultRule(rule: DefaultTocRuleRecord, createdAt: string): Omit<TocRule, 'id'> {
  return {
    name: rule.name,
    rule: rule.rule,
    example: rule.example,
    serialNumber: rule.serialNumber,
    enable: rule.enable,
    isDefault: true,
    createdAt,
  };
}

export async function ensureDefaultTocRules(): Promise<void> {
  const count = await db.tocRules.count();
  if (count > 0) {
    return;
  }

  const createdAt = new Date().toISOString();
  const defaultRules = await loadDefaultTocRules();
  for (const rule of defaultRules) {
    await db.tocRules.add({
      ...mapDefaultRule(rule, createdAt),
    });
  }
}
