import type { PurifyRule } from '@shared/text-processing';

import { purificationRuleRepository } from '@domains/settings';

import type { RulesSnapshotData, RulesSnapshotDigests } from './types';

function serializeRule(rule: PurifyRule): string {
  return JSON.stringify([
    rule.name ?? '',
    rule.group ?? '',
    rule.pattern ?? '',
    rule.replacement ?? '',
    rule.is_regex ?? true,
    rule.order ?? 10,
    rule.target_scope ?? 'text',
    rule.execution_stage ?? 'post-ast',
    rule.rule_version ?? 0,
    rule.book_scope ?? '',
    rule.exclude_book_scope ?? '',
    rule.exclusive_group ?? '',
  ]);
}

function buildRulesDigest(
  rules: PurifyRule[],
  predicate: (rule: PurifyRule) => boolean,
): string {
  const relevantRules = rules.filter(predicate).map((rule) => serializeRule(rule));
  return relevantRules.length > 0 ? relevantRules.join('\u0001') : 'none';
}

function buildRulesSnapshotDigests(rules: PurifyRule[]): RulesSnapshotDigests {
  const isPostAstRule = (rule: PurifyRule) => rule.execution_stage === 'post-ast';
  const isPlainTextOnlyRule = (rule: PurifyRule) => rule.execution_stage === 'plain-text-only';

  return {
    plainTextOnlyAll: buildRulesDigest(rules, isPlainTextOnlyRule),
    plainTextOnlyText: buildRulesDigest(
      rules,
      (rule) => isPlainTextOnlyRule(rule)
        && (rule.target_scope === 'all' || rule.target_scope === 'text'),
    ),
    postAstContent: buildRulesDigest(rules, isPostAstRule),
    postAstHeading: buildRulesDigest(
      rules,
      (rule) => isPostAstRule(rule)
        && (rule.target_scope === 'all' || rule.target_scope === 'heading'),
    ),
  };
}

export async function loadRulesSnapshot(): Promise<RulesSnapshotData> {
  const snapshot = await purificationRuleRepository.getEnabledPurificationRulesSnapshot();

  return {
    digests: buildRulesSnapshotDigests(snapshot.rules),
    rules: snapshot.rules,
    version: snapshot.version,
  };
}
