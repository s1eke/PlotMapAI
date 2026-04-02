import { loadRulesFromJson, type PurifyRule } from '@shared/text-processing';

const LEGACY_TO_CANONICAL_RULE_KEYS = {
  bookScope: 'book_scope',
  excludeBookScope: 'exclude_book_scope',
  exclusiveGroup: 'exclusive_group',
  isEnabled: 'is_enabled',
  isRegex: 'is_regex',
  scopeContent: 'scope_content',
  scopeTitle: 'scope_title',
} as const;

function toCanonicalRuleRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const mappedRule: Record<string, unknown> = { ...raw };

  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_TO_CANONICAL_RULE_KEYS)) {
    if (mappedRule[canonicalKey] === undefined && mappedRule[legacyKey] !== undefined) {
      mappedRule[canonicalKey] = mappedRule[legacyKey];
    }
  }

  return mappedRule;
}

export function normalizeImportedPurificationRules(parsed: unknown[]): PurifyRule[] {
  const canonicalRules = parsed
    .filter((rule): rule is Record<string, unknown> => (
      typeof rule === 'object' && rule !== null && !Array.isArray(rule)
    ))
    .map(toCanonicalRuleRecord);

  return loadRulesFromJson(JSON.stringify(canonicalRules));
}

export function loadImportedPurificationRulesFromJson(json: string): PurifyRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Rules must be a JSON array');
  }

  return normalizeImportedPurificationRules(parsed);
}
