import yaml from 'js-yaml';
import { db } from '../../services/db';
import { debugLog } from '../../services/debug';
import type { TocRule } from './types';

function tocRuleToApi(rule: import('../../services/db').TocRule): TocRule {
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

export const tocRulesApi = {
  getTocRules: async (): Promise<TocRule[]> => {
    const rules = await db.tocRules.orderBy('serialNumber').toArray();
    return rules.map(tocRuleToApi);
  },

  createTocRule: async (data: Omit<TocRule, 'id' | 'isDefault'>): Promise<TocRule> => {
    const now = new Date().toISOString();
    const last = await db.tocRules.orderBy('serialNumber').last();
    const id = await db.tocRules.add({
      id: undefined as unknown as number,
      name: data.name,
      rule: data.rule,
      example: data.example || '',
      serialNumber: data.priority ?? (last?.serialNumber ?? -1) + 1,
      enable: data.isEnabled ?? true,
      isDefault: false,
      createdAt: now,
    });
    const rule = await db.tocRules.get(id);
    return tocRuleToApi(rule!);
  },

  updateTocRule: async (id: number, data: Partial<TocRule>): Promise<TocRule> => {
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.rule !== undefined) updates.rule = data.rule;
    if (data.example !== undefined) updates.example = data.example;
    if (data.isEnabled !== undefined) updates.enable = data.isEnabled;
    if (data.priority !== undefined) updates.serialNumber = data.priority;
    await db.tocRules.update(id, updates);
    const rule = await db.tocRules.get(id);
    if (!rule) throw new Error('Rule not found');
    return tocRuleToApi(rule);
  },

  deleteTocRule: async (id: number): Promise<{ message: string }> => {
    const rule = await db.tocRules.get(id);
    if (!rule) throw new Error('Rule not found');
    if (rule.isDefault) throw new Error('Cannot delete default rules');
    await db.tocRules.delete(id);
    return { message: 'Rule deleted' };
  },

  uploadTocRulesYaml: async (file: File): Promise<TocRule[]> => {
    const text = await file.text();
    let rules: Array<Record<string, unknown>>;
    try {
      const parsed = yaml.load(text);
      rules = Array.isArray(parsed)
        ? parsed
        : ((parsed as Record<string, unknown>)?.rules as Array<Record<string, unknown>>) || [];
    } catch (error) {
      throw new Error(`Invalid YAML file: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(rules)) throw new Error('Rules must be a YAML array');

    const existing = await db.tocRules.toArray();
    const existingRules = new Set(existing.map(rule => rule.rule));
    const now = new Date().toISOString();
    let added = 0;
    for (let index = 0; index < rules.length; index += 1) {
      const candidate = rules[index];
      if (typeof candidate !== 'object' || candidate === null) continue;
      const rule = candidate as Record<string, unknown>;
      const ruleText = (rule.rule || rule.pattern) as string;
      if (!ruleText || existingRules.has(ruleText)) continue;
      existingRules.add(ruleText);
      await db.tocRules.add({
        id: undefined as unknown as number,
        name: (rule.name as string) || `Imported Rule ${index}`,
        rule: ruleText,
        example: (rule.example as string) || '',
        serialNumber: (rule.serialNumber ?? rule.priority ?? rule.serial_number ?? index) as number,
        enable: (rule.enable ?? rule.isEnabled ?? true) as boolean,
        isDefault: false,
        createdAt: now,
      });
      added += 1;
    }
    debugLog('Settings', `uploadTocRulesYaml: ${rules.length} parsed, ${added} added`);
    return tocRulesApi.getTocRules();
  },

  exportTocRulesYaml: async (): Promise<string> => {
    const rules = await db.tocRules.toArray();
    const exportData = rules.map((rule, index) => ({
      name: rule.name,
      rule: rule.rule,
      example: rule.example || '',
      serialNumber: rule.serialNumber ?? index,
      enable: rule.enable,
    }));
    return yaml.dump(exportData, { lineWidth: 200, noRefs: true });
  },
};
