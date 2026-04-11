import type {
  PurifiedChapter,
  PurifiedTitle,
  PurifyRule,
  PurificationExecutionStage,
  PurificationTargetScope,
} from './types';

export type PurifyTextTarget = Exclude<PurificationTargetScope, 'all'>;

export const CURRENT_PURIFICATION_RULE_VERSION = 2;

interface CompiledPurifyRule {
  bookScope: string;
  excludeBookScope: string;
  exclusiveGroup: string;
  executionStage: PurificationExecutionStage;
  isEnabled: boolean;
  isRegex: boolean;
  name: string;
  order: number;
  pattern: string;
  replacement: string | null;
  ruleVersion: number;
  targetScope: PurificationTargetScope;
}

function jsFullwidthToHalfwidth(match: string): string {
  const result: string[] = [];
  for (const character of match) {
    const code = character.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) {
      result.push(String.fromCodePoint(code - 0xfee0));
    } else if (code === 0x3000) {
      result.push(' ');
    } else {
      result.push(character);
    }
  }
  return result.join('');
}

function jsHalfwidthToFullwidth(match: string): string {
  const result: string[] = [];
  for (const character of match) {
    const code = character.codePointAt(0)!;
    if (code >= 0x21 && code <= 0x7e) {
      result.push(String.fromCodePoint(code + 0xfee0));
    } else if (code === 0x20) {
      result.push('\u3000');
    } else {
      result.push(character);
    }
  }
  return result.join('');
}

function jsStripSpaces(match: string): string {
  return match.replace(/\s+/gu, '');
}

function jsNormalizeUnicode(match: string): string {
  return match.normalize('NFC');
}

type JsFunction = (match: string) => string;

const JS_FUNCTION_MAP: Record<string, JsFunction> = {
  fullwidth: jsFullwidthToHalfwidth,
  halfwidth: jsHalfwidthToFullwidth,
  全角: jsFullwidthToHalfwidth,
  半角: jsHalfwidthToFullwidth,
  strip: jsStripSpaces,
  normalize: jsNormalizeUnicode,
};

function resolveJsReplacement(jsCode: string): JsFunction | null {
  const lower = jsCode.toLowerCase().trim();
  for (const [key, fn] of Object.entries(JS_FUNCTION_MAP)) {
    if (lower.includes(key)) {
      return fn;
    }
  }
  return null;
}

function resolveLegacyTargetScope(rule: PurifyRule): PurificationTargetScope {
  if (rule.scope_content === true) {
    return 'all';
  }

  if (rule.scope_title === true) {
    return 'heading';
  }

  return 'text';
}

function resolveLegacyRuleEnabled(rule: PurifyRule): boolean {
  const isEnabled = rule.is_enabled ?? true;
  if (!isEnabled) {
    return false;
  }

  return !(rule.scope_title === false && rule.scope_content === false);
}

function toCompiledPurifyRule(rule: PurifyRule, index: number): CompiledPurifyRule | null {
  const pattern = rule.pattern ?? '';
  if (pattern.length === 0) {
    return null;
  }

  return {
    name: rule.name ?? `Imported Rule ${index}`,
    pattern,
    replacement: rule.replacement ?? '',
    isRegex: rule.is_regex ?? true,
    isEnabled: rule.target_scope || rule.execution_stage || rule.rule_version
      ? (rule.is_enabled ?? true)
      : resolveLegacyRuleEnabled(rule),
    order: rule.order ?? 10,
    targetScope: rule.target_scope ?? resolveLegacyTargetScope(rule),
    executionStage: rule.execution_stage ?? 'post-ast',
    ruleVersion: rule.rule_version ?? CURRENT_PURIFICATION_RULE_VERSION,
    bookScope: rule.book_scope ?? '',
    excludeBookScope: rule.exclude_book_scope ?? '',
    exclusiveGroup: rule.exclusive_group?.trim() ?? '',
  };
}

function getCompiledPurifyRules(rules: PurifyRule[]): CompiledPurifyRule[] {
  return rules
    .map((rule, index) => toCompiledPurifyRule(rule, index))
    .filter((rule): rule is CompiledPurifyRule => rule !== null);
}

function matchesBookScope(rule: CompiledPurifyRule, bookTitle: string): boolean {
  if (rule.bookScope && bookTitle && !bookTitle.includes(rule.bookScope)) {
    return false;
  }

  if (rule.excludeBookScope && bookTitle && bookTitle.includes(rule.excludeBookScope)) {
    return false;
  }

  return true;
}

function matchesExecutionStage(
  rule: CompiledPurifyRule,
  executionStage: PurificationExecutionStage,
): boolean {
  return rule.executionStage === executionStage;
}

function matchesTargetScope(
  rule: CompiledPurifyRule,
  target: PurifyTextTarget,
): boolean {
  return rule.targetScope === 'all' || rule.targetScope === target;
}

function getOrderedPurifyRules(params: {
  bookTitle: string;
  executionStage: PurificationExecutionStage;
  rules: PurifyRule[];
  target: PurifyTextTarget;
}): CompiledPurifyRule[] {
  const seenExclusiveGroups = new Set<string>();

  return getCompiledPurifyRules(params.rules)
    .filter((rule) =>
      rule.isEnabled
      && matchesExecutionStage(rule, params.executionStage)
      && matchesTargetScope(rule, params.target)
      && matchesBookScope(rule, params.bookTitle))
    .sort((first, second) => first.order - second.order)
    .filter((rule) => {
      if (!rule.exclusiveGroup) {
        return true;
      }

      if (seenExclusiveGroups.has(rule.exclusiveGroup)) {
        return false;
      }

      seenExclusiveGroups.add(rule.exclusiveGroup);
      return true;
    });
}

export function loadRulesFromJson(json: string): PurifyRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Rules must be a JSON array');
  }

  const validated: PurifyRule[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const rule = parsed[index];
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
      continue;
    }

    const raw = rule as Record<string, unknown>;
    validated.push({
      name: typeof raw.name === 'string' ? raw.name : `Imported Rule ${index}`,
      group: typeof raw.group === 'string' ? raw.group : undefined,
      pattern: typeof raw.pattern === 'string' ? raw.pattern : undefined,
      replacement:
        typeof raw.replacement === 'string' || raw.replacement === null
          ? raw.replacement
          : undefined,
      is_regex: typeof raw.is_regex === 'boolean' ? raw.is_regex : undefined,
      is_enabled: typeof raw.is_enabled === 'boolean' ? raw.is_enabled : undefined,
      order: typeof raw.order === 'number' ? raw.order : 10,
      target_scope:
        raw.target_scope === 'text'
        || raw.target_scope === 'heading'
        || raw.target_scope === 'caption'
        || raw.target_scope === 'all'
          ? raw.target_scope
          : undefined,
      execution_stage:
        raw.execution_stage === 'pre-ast'
        || raw.execution_stage === 'post-ast'
        || raw.execution_stage === 'plain-text-only'
          ? raw.execution_stage
          : undefined,
      rule_version: typeof raw.rule_version === 'number' ? raw.rule_version : undefined,
      scope_title: typeof raw.scope_title === 'boolean' ? raw.scope_title : undefined,
      scope_content: typeof raw.scope_content === 'boolean' ? raw.scope_content : undefined,
      book_scope: typeof raw.book_scope === 'string' ? raw.book_scope : undefined,
      exclude_book_scope:
        typeof raw.exclude_book_scope === 'string' ? raw.exclude_book_scope : undefined,
      exclusive_group:
        typeof raw.exclusive_group === 'string' ? raw.exclusive_group : undefined,
    });
  }

  return validated;
}

export function hasPurifyRulesForExecutionStage(
  rules: PurifyRule[],
  executionStage: PurificationExecutionStage,
): boolean {
  return getCompiledPurifyRules(rules)
    .some((rule) => rule.isEnabled && rule.executionStage === executionStage);
}

export function purify(
  text: string,
  rules: PurifyRule[],
  target: PurifyTextTarget,
  bookTitle: string,
  executionStage: PurificationExecutionStage = 'plain-text-only',
): string {
  if (!text || !rules || rules.length === 0) {
    return text;
  }

  let result = text.replace(/\r\n/g, '\n');
  const orderedRules = getOrderedPurifyRules({
    rules,
    target,
    bookTitle,
    executionStage,
  });

  for (const rule of orderedRules) {
    let replacement = rule.replacement ?? '';

    if (replacement === null) {
      replacement = '';
    }

    try {
      if (rule.isRegex) {
        const compiled = new RegExp(rule.pattern, 'gu');
        if (replacement.startsWith('@js:')) {
          const fn = resolveJsReplacement(replacement.slice(4));
          if (fn) {
            result = result.replace(compiled, (match) => fn(match));
          }
        } else {
          result = result.replace(compiled, replacement);
        }
      } else {
        result = result.split(rule.pattern).join(replacement);
      }
    } catch {
      continue;
    }
  }

  return result;
}

export function purifyTitles(
  titles: PurifiedTitle[],
  rules: PurifyRule[],
  bookTitle: string,
  executionStage: PurificationExecutionStage = 'plain-text-only',
): PurifiedTitle[] {
  if (rules.length === 0) {
    return titles;
  }

  return titles.map((title) => ({
    ...title,
    title: purify(title.title, rules, 'heading', bookTitle, executionStage),
  }));
}

export function purifyChapter(
  chapter: PurifiedChapter,
  rules: PurifyRule[],
  bookTitle: string,
  executionStage: PurificationExecutionStage = 'plain-text-only',
): PurifiedChapter {
  if (rules.length === 0) {
    return chapter;
  }

  return {
    ...chapter,
    title: purify(chapter.title, rules, 'heading', bookTitle, executionStage),
    content: purify(chapter.content, rules, 'text', bookTitle, executionStage),
  };
}

export function purifyChapters(
  chapters: PurifiedChapter[],
  rules: PurifyRule[],
  bookTitle: string,
  executionStage: PurificationExecutionStage = 'plain-text-only',
): PurifiedChapter[] {
  if (rules.length === 0) {
    return chapters;
  }

  return chapters.map((chapter) => purifyChapter(chapter, rules, bookTitle, executionStage));
}
