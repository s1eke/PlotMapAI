import { db } from '@infra/db';
import { debugLog } from '@app/debug/service';
import { AppErrorCode, createAppError } from '@shared/errors';
import { dumpYaml, loadYaml } from '../services/yaml';
import type { PurificationRule } from './types';

function unescapeReplacement(raw: string): string {
  return raw.replace(/\\([nrt\\])/g, (_, ch: string) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return '\\';
  });
}

function purRuleToApi(rule: import('@infra/db').PurificationRule): PurificationRule {
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
    scopeTitle: rule.scopeTitle,
    scopeContent: rule.scopeContent,
    bookScope: rule.bookScope || undefined,
    excludeBookScope: rule.excludeBookScope || undefined,
    exclusiveGroup: rule.exclusiveGroup || undefined,
    isDefault: rule.isDefault,
    timeoutMs: rule.timeoutMs,
    createdAt: rule.createdAt,
  };
}

export const purificationRulesApi = {
  getPurificationRules: async (): Promise<PurificationRule[]> => {
    const rules = await db.purificationRules.orderBy('order').toArray();
    return rules.map(purRuleToApi);
  },

  createPurificationRule: async (data: Partial<PurificationRule>): Promise<PurificationRule> => {
    if (!data.name || !data.pattern) {
      throw createAppError({
        code: AppErrorCode.PURIFICATION_RULE_FIELDS_REQUIRED,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.PURIFICATION_RULE_FIELDS_REQUIRED',
        debugMessage: 'Missing field: name or pattern',
      });
    }
    const now = new Date().toISOString();
    const id = await db.purificationRules.add({
      id: undefined as unknown as number,
      externalId: null,
      name: data.name,
      group: data.group || 'Purification',
      pattern: data.pattern,
      replacement: unescapeReplacement(data.replacement || ''),
      isRegex: data.isRegex ?? true,
      isEnabled: data.isEnabled ?? true,
      order: data.order ?? 10,
      scopeTitle: data.scopeTitle ?? true,
      scopeContent: data.scopeContent ?? true,
      bookScope: data.bookScope || '',
      excludeBookScope: data.excludeBookScope || '',
      exclusiveGroup: data.exclusiveGroup || '',
      isDefault: false,
      timeoutMs: data.timeoutMs ?? 3000,
      createdAt: now,
    });
    const rule = await db.purificationRules.get(id);
    return purRuleToApi(rule!);
  },

  updatePurificationRule: async (id: number, data: Partial<PurificationRule>): Promise<PurificationRule> => {
    const updates: Record<string, unknown> = {};
    const fields = [
      'name',
      'group',
      'pattern',
      'isRegex',
      'isEnabled',
      'order',
      'scopeTitle',
      'scopeContent',
      'bookScope',
      'excludeBookScope',
      'exclusiveGroup',
      'timeoutMs',
    ] as const;
    for (const field of fields) {
      if (data[field] !== undefined) updates[field] = data[field];
    }
    if (data.replacement !== undefined) {
      updates.replacement = unescapeReplacement(data.replacement);
    }
    await db.purificationRules.update(id, updates);
    const rule = await db.purificationRules.get(id);
    if (!rule) {
      throw createAppError({
        code: AppErrorCode.RULE_NOT_FOUND,
        kind: 'not-found',
        source: 'settings',
        userMessageKey: 'errors.RULE_NOT_FOUND',
        debugMessage: 'Rule not found',
      });
    }
    return purRuleToApi(rule);
  },

  deletePurificationRule: async (id: number): Promise<{ message: string }> => {
    const rule = await db.purificationRules.get(id);
    if (!rule) {
      throw createAppError({
        code: AppErrorCode.RULE_NOT_FOUND,
        kind: 'not-found',
        source: 'settings',
        userMessageKey: 'errors.RULE_NOT_FOUND',
        debugMessage: 'Rule not found',
      });
    }
    if (rule.isDefault) {
      throw createAppError({
        code: AppErrorCode.CANNOT_DELETE_DEFAULT_RULE,
        kind: 'conflict',
        source: 'settings',
        userMessageKey: 'errors.CANNOT_DELETE_DEFAULT_RULE',
        debugMessage: 'Cannot delete default rules',
      });
    }
    await db.purificationRules.delete(id);
    return { message: 'Rule deleted' };
  },

  clearAllPurificationRules: async (): Promise<{ message: string }> => {
    await db.purificationRules.clear();
    return { message: 'All rules cleared' };
  },

  uploadPurificationRulesYaml: async (file: File): Promise<PurificationRule[]> => {
    const text = await file.text();
    debugLog('Settings', `upload purify rules file: ${file.name}, size=${file.size}, text length=${text.length}`);
    let parsed: unknown[];
    try {
      const loaded = await loadYaml(text);
      parsed = Array.isArray(loaded) ? loaded : [];
    } catch (error) {
      throw createAppError({
        code: AppErrorCode.INVALID_YAML_FILE,
        kind: 'validation',
        source: 'settings',
        userMessageKey: 'errors.INVALID_YAML_FILE',
        debugMessage: `Invalid YAML file: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      });
    }
    debugLog('Settings', `parsed ${parsed.length} rules`);
    const existing = await db.purificationRules.toArray();
    const existingKeys = new Set(existing.map(rule => `${rule.pattern}\u0000${rule.isRegex}`));
    const now = new Date().toISOString();
    let added = 0;
    for (let index = 0; index < parsed.length; index += 1) {
      const candidate = parsed[index];
      if (typeof candidate !== 'object' || candidate === null) continue;
      const rule = candidate as Record<string, unknown>;
      const pattern = (rule.pattern as string) || '';
      const isRegex = (rule.is_regex ?? rule.isRegex ?? true) as boolean;
      const name = (rule.name as string) || `Imported Rule ${index}`;
      const exclusiveGroup = (rule.exclusive_group ?? rule.exclusiveGroup ?? '') as string;
      const key = `${pattern}\u0000${isRegex}`;
      if (!pattern || existingKeys.has(key)) {
        debugLog('Settings', `    skip duplicate: "${name}"`);
        continue;
      }
      existingKeys.add(key);
      await db.purificationRules.add({
        id: undefined as unknown as number,
        externalId: null,
        name,
        group: (rule.group as string) || 'Purification',
        pattern,
        replacement: unescapeReplacement((rule.replacement as string) || ''),
        isRegex,
        isEnabled: (rule.is_enabled ?? rule.isEnabled ?? true) as boolean,
        order: (rule.order as number) ?? 10,
        scopeTitle: (rule.scope_title ?? rule.scopeTitle ?? true) as boolean,
        scopeContent: (rule.scope_content ?? rule.scopeContent ?? true) as boolean,
        bookScope: (rule.book_scope ?? rule.bookScope ?? '') as string,
        excludeBookScope: (rule.exclude_book_scope ?? rule.excludeBookScope ?? '') as string,
        exclusiveGroup,
        isDefault: false,
        timeoutMs: 3000,
        createdAt: now,
      });
      added += 1;
    }
    debugLog('Settings', `uploadPurificationRulesYaml: ${parsed.length} parsed, ${added} added`);
    return purificationRulesApi.getPurificationRules();
  },

  exportPurificationRulesYaml: async (): Promise<string> => {
    const rules = await db.purificationRules.orderBy('order').toArray();
    const exportData = rules.map(rule => ({
      name: rule.name,
      group: rule.group || 'Purification',
      pattern: rule.pattern,
      replacement: rule.replacement,
      is_regex: rule.isRegex,
      is_enabled: rule.isEnabled,
      order: rule.order,
      scope_title: rule.scopeTitle,
      scope_content: rule.scopeContent,
      book_scope: rule.bookScope || '',
      exclude_book_scope: rule.excludeBookScope || '',
      exclusive_group: rule.exclusiveGroup || '',
    }));
    return dumpYaml(exportData, { lineWidth: 200, noRefs: true });
  },
};
