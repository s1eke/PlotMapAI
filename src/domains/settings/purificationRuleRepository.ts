import { debugLog } from '@shared/debug';
import {
  CURRENT_PURIFICATION_RULE_VERSION,
  loadRulesFromJson,
  type PurifyRule,
} from '@shared/text-processing';
import { db } from '@infra/db';
import { AppErrorCode, createAppError } from '@shared/errors';
import { mapPurificationRuleRecordToDomain } from './persistenceMappers';
import { dumpYaml, loadYaml } from './services/yaml';
import type { PurificationRule } from './types';

interface PurificationRulesYamlV2 {
  version: 2;
  kind: 'purification-rules';
  rules: unknown[];
}

interface EnabledPurificationRulesSnapshot {
  rules: PurifyRule[];
  version: number;
}

let enabledPurificationRulesSnapshot: EnabledPurificationRulesSnapshot | null = null;
let enabledPurificationRulesSnapshotPromise:
  Promise<EnabledPurificationRulesSnapshot> | null = null;
let enabledPurificationRulesVersion = 0;

function isPurificationRulesYamlV2(value: unknown): value is PurificationRulesYamlV2 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.version === 2
    && candidate.kind === 'purification-rules'
    && Array.isArray(candidate.rules);
}

function unescapeReplacement(raw: string): string {
  return raw.replace(/\\([nrt\\])/g, (_, ch: string) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return '\\';
  });
}

function toPersistedPurifyRule(rule: PurificationRule): PurifyRule {
  return {
    name: rule.name,
    group: rule.group,
    pattern: rule.pattern,
    replacement: rule.replacement,
    is_regex: rule.isRegex,
    is_enabled: rule.isEnabled,
    order: rule.order,
    target_scope: rule.targetScope,
    execution_stage: rule.executionStage,
    rule_version: rule.ruleVersion,
    book_scope: rule.bookScope,
    exclude_book_scope: rule.excludeBookScope,
    exclusive_group: rule.exclusiveGroup,
  };
}

function extractImportedRules(loaded: unknown): unknown[] {
  if (Array.isArray(loaded)) {
    return loaded;
  }

  if (isPurificationRulesYamlV2(loaded)) {
    return loaded.rules;
  }

  return [];
}

function invalidateEnabledPurificationRulesSnapshot(): void {
  enabledPurificationRulesSnapshot = null;
  enabledPurificationRulesSnapshotPromise = null;
  enabledPurificationRulesVersion += 1;
}

export function notifyPurificationRulesChanged(): void {
  invalidateEnabledPurificationRulesSnapshot();
}

export function resetPurificationRuleRepositorySnapshotsForTests(): void {
  enabledPurificationRulesSnapshot = null;
  enabledPurificationRulesSnapshotPromise = null;
  enabledPurificationRulesVersion = 0;
}

export const purificationRuleRepository = {
  getPurificationRules: async (): Promise<PurificationRule[]> => {
    const rules = await db.purificationRules.orderBy('order').toArray();
    return rules.map(mapPurificationRuleRecordToDomain);
  },

  getEnabledPurificationRules: async (): Promise<PurifyRule[]> => {
    const snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();
    return snapshot.rules;
  },

  getEnabledPurificationRulesSnapshot: async (): Promise<EnabledPurificationRulesSnapshot> => {
    if (enabledPurificationRulesSnapshot) {
      return enabledPurificationRulesSnapshot;
    }
    if (enabledPurificationRulesSnapshotPromise) {
      return enabledPurificationRulesSnapshotPromise;
    }

    const snapshotVersion = enabledPurificationRulesVersion;
    const snapshotPromise = db.purificationRules
      .filter((rule) => rule.isEnabled)
      .sortBy('order')
      .then((rules) => {
        const snapshot = {
          rules: rules.map((rule) =>
            toPersistedPurifyRule(mapPurificationRuleRecordToDomain(rule))),
          version: snapshotVersion,
        };
        enabledPurificationRulesSnapshot = snapshot;
        enabledPurificationRulesSnapshotPromise = null;
        return snapshot;
      })
      .catch((error) => {
        enabledPurificationRulesSnapshotPromise = null;
        throw error;
      });

    enabledPurificationRulesSnapshotPromise = snapshotPromise;
    return snapshotPromise;
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
      externalId: null,
      name: data.name,
      group: data.group || 'Purification',
      pattern: data.pattern,
      replacement: unescapeReplacement(data.replacement || ''),
      isRegex: data.isRegex ?? true,
      isEnabled: data.isEnabled ?? true,
      order: data.order ?? 10,
      targetScope: data.targetScope ?? 'all',
      executionStage: data.executionStage ?? 'post-ast',
      ruleVersion: data.ruleVersion ?? CURRENT_PURIFICATION_RULE_VERSION,
      bookScope: data.bookScope || '',
      excludeBookScope: data.excludeBookScope || '',
      exclusiveGroup: data.exclusiveGroup || '',
      isDefault: false,
      timeoutMs: data.timeoutMs ?? 3000,
      createdAt: now,
    });

    const rule = await db.purificationRules.get(id);
    invalidateEnabledPurificationRulesSnapshot();
    return mapPurificationRuleRecordToDomain(rule!);
  },

  updatePurificationRule: async (
    id: number,
    data: Partial<PurificationRule>,
  ): Promise<PurificationRule> => {
    const updates: Record<string, unknown> = {};
    const fields = [
      'name',
      'group',
      'pattern',
      'isRegex',
      'isEnabled',
      'order',
      'targetScope',
      'executionStage',
      'ruleVersion',
      'bookScope',
      'excludeBookScope',
      'exclusiveGroup',
      'timeoutMs',
    ] as const;

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates[field] = data[field];
      }
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

    invalidateEnabledPurificationRulesSnapshot();
    return mapPurificationRuleRecordToDomain(rule);
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
    invalidateEnabledPurificationRulesSnapshot();
    return { message: 'Rule deleted' };
  },

  clearAllPurificationRules: async (): Promise<{ message: string }> => {
    await db.purificationRules.clear();
    invalidateEnabledPurificationRulesSnapshot();
    return { message: 'All rules cleared' };
  },

  uploadPurificationRulesYaml: async (file: File): Promise<PurificationRule[]> => {
    const text = await file.text();
    debugLog('Settings', `upload purify rules file: ${file.name}, size=${file.size}, text length=${text.length}`);

    let loaded: unknown;
    try {
      loaded = await loadYaml(text);
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

    const importedRules = loadRulesFromJson(JSON.stringify(extractImportedRules(loaded)));
    debugLog('Settings', `parsed ${importedRules.length} rules`);

    const existing = await db.purificationRules.toArray();
    const existingKeys = new Set(existing.map((rule) => `${rule.pattern}\u0000${rule.isRegex}`));
    const now = new Date().toISOString();
    let added = 0;

    for (const rule of importedRules) {
      const pattern = rule.pattern || '';
      const isRegex = rule.is_regex ?? true;
      const name = rule.name || 'Imported Rule';
      const exclusiveGroup = rule.exclusive_group || '';
      const key = `${pattern}\u0000${isRegex}`;
      if (!pattern || existingKeys.has(key)) {
        debugLog('Settings', `    skip duplicate: "${name}"`);
        continue;
      }

      existingKeys.add(key);
      await db.purificationRules.add({
        externalId: null,
        name,
        group: rule.group || 'Purification',
        pattern,
        replacement: unescapeReplacement(rule.replacement || ''),
        isRegex,
        isEnabled: rule.is_enabled ?? true,
        order: rule.order ?? 10,
        targetScope: rule.target_scope ?? 'all',
        executionStage: rule.execution_stage ?? 'post-ast',
        ruleVersion: rule.rule_version ?? CURRENT_PURIFICATION_RULE_VERSION,
        bookScope: rule.book_scope || '',
        excludeBookScope: rule.exclude_book_scope || '',
        exclusiveGroup,
        isDefault: false,
        timeoutMs: 3000,
        createdAt: now,
      });
      added += 1;
    }

    debugLog('Settings', `uploadPurificationRulesYaml: ${importedRules.length} parsed, ${added} added`);
    invalidateEnabledPurificationRulesSnapshot();
    return purificationRuleRepository.getPurificationRules();
  },

  exportPurificationRulesYaml: async (): Promise<string> => {
    const rules = await db.purificationRules.orderBy('order').toArray();
    const exportData = {
      version: 2 as const,
      kind: 'purification-rules' as const,
      rules: rules.map((rule) => ({
        name: rule.name,
        group: rule.group || 'Purification',
        pattern: rule.pattern,
        replacement: rule.replacement,
        is_regex: rule.isRegex,
        is_enabled: rule.isEnabled,
        order: rule.order,
        target_scope: rule.targetScope,
        execution_stage: rule.executionStage,
        rule_version: rule.ruleVersion,
        book_scope: rule.bookScope || '',
        exclude_book_scope: rule.excludeBookScope || '',
        exclusive_group: rule.exclusiveGroup || '',
      })),
    };

    return dumpYaml(exportData, { lineWidth: 200, noRefs: true });
  },
};
