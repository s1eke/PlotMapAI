import type { PurifiedChapter, PurifiedTitle, PurifyRule } from './types';

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
  '全角': jsFullwidthToHalfwidth,
  '半角': jsHalfwidthToFullwidth,
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

  const mapping: Record<string, string> = {
    bookScope: 'book_scope',
    excludeBookScope: 'exclude_book_scope',
    group: 'group',
    id: 'external_id',
    exclusiveGroup: 'exclusive_group',
    isEnabled: 'is_enabled',
    isRegex: 'is_regex',
    name: 'name',
    order: 'order',
    pattern: 'pattern',
    replacement: 'replacement',
    scopeContent: 'scope_content',
    scopeTitle: 'scope_title',
  };

  const validated: PurifyRule[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const rule = parsed[index];
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
      continue;
    }

    const raw = rule as Record<string, unknown>;
    const mappedRule: Record<string, unknown> = {};
    for (const [legacyKey, modelKey] of Object.entries(mapping)) {
      mappedRule[modelKey] = raw[legacyKey] ?? undefined;
    }

    if (!mappedRule.name) {
      mappedRule.name = `Imported Rule ${index}`;
    }
    if (mappedRule.order == null) {
      mappedRule.order = 10;
    }

    validated.push(mappedRule as PurifyRule);
  }

  return validated;
}

export function purify(
  text: string,
  rules: PurifyRule[],
  scope: 'title' | 'content',
  bookTitle: string,
): string {
  if (!text || !rules || rules.length === 0) {
    return text;
  }

  let result = text.replace(/\r\n/g, '\n');

  const activeRules = rules
    .filter((rule) => {
      const isEnabled = rule.is_enabled ?? true;
      const allowTitle = rule.scope_title ?? true;
      const allowContent = rule.scope_content ?? true;
      const bookScope = rule.book_scope ?? '';
      const excludeBookScope = rule.exclude_book_scope ?? '';

      if (!isEnabled) {
        return false;
      }
      if (scope === 'title' && !allowTitle) {
        return false;
      }
      if (scope === 'content' && !allowContent) {
        return false;
      }
      if (bookScope && bookTitle && !bookTitle.includes(bookScope)) {
        return false;
      }
      if (excludeBookScope && bookTitle && bookTitle.includes(excludeBookScope)) {
        return false;
      }
      return true;
    })
    .sort((first, second) => (first.order ?? 0) - (second.order ?? 0));

  const seenExclusiveGroups = new Set<string>();
  const orderedRules = activeRules.filter((rule) => {
    const exclusiveGroup = rule.exclusive_group?.trim();
    if (!exclusiveGroup) {
      return true;
    }

    if (seenExclusiveGroups.has(exclusiveGroup)) {
      return false;
    }

    seenExclusiveGroups.add(exclusiveGroup);
    return true;
  });

  for (const rule of orderedRules) {
    const pattern = rule.pattern ?? '';
    let replacement = rule.replacement ?? '';
    const isRegex = rule.is_regex ?? true;

    if (!pattern) {
      continue;
    }

    if (replacement === null) {
      replacement = '';
    }

    try {
      if (isRegex) {
        const compiled = new RegExp(pattern, 'gu');
        if (replacement.startsWith('@js:')) {
          const fn = resolveJsReplacement(replacement.slice(4));
          if (fn) {
            result = result.replace(compiled, (match) => fn(match));
          }
        } else {
          result = result.replace(compiled, replacement);
        }
      } else {
        result = result.split(pattern).join(replacement);
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
): PurifiedTitle[] {
  if (rules.length === 0) {
    return titles;
  }

  return titles.map((title) => ({
    ...title,
    title: purify(title.title, rules, 'title', bookTitle),
  }));
}

export function purifyChapter(
  chapter: PurifiedChapter,
  rules: PurifyRule[],
  bookTitle: string,
): PurifiedChapter {
  if (rules.length === 0) {
    return chapter;
  }

  return {
    ...chapter,
    title: purify(chapter.title, rules, 'title', bookTitle),
    content: purify(chapter.content, rules, 'content', bookTitle),
  };
}

export function purifyChapters(
  chapters: PurifiedChapter[],
  rules: PurifyRule[],
  bookTitle: string,
): PurifiedChapter[] {
  if (rules.length === 0) {
    return chapters;
  }

  return chapters.map((chapter) => purifyChapter(chapter, rules, bookTitle));
}
