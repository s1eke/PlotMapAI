import { debugLog } from '@app/debug/service';

export interface PurifyRule {
  name?: string;
  group?: string;
  pattern?: string;
  replacement?: string | null;
  is_regex?: boolean;
  is_enabled?: boolean;
  order?: number;
  scope_title?: boolean;
  scope_content?: boolean;
  book_scope?: string;
  exclude_book_scope?: string;
}

function jsFullwidthToHalfwidth(match: string): string {
  const result: string[] = [];
  for (const ch of match) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) {
      result.push(String.fromCodePoint(code - 0xfee0));
    } else if (code === 0x3000) {
      result.push(" ");
    } else {
      result.push(ch);
    }
  }
  return result.join("");
}

function jsHalfwidthToFullwidth(match: string): string {
  const result: string[] = [];
  for (const ch of match) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x21 && code <= 0x7e) {
      result.push(String.fromCodePoint(code + 0xfee0));
    } else if (code === 0x20) {
      result.push("\u3000");
    } else {
      result.push(ch);
    }
  }
  return result.join("");
}

function jsStripSpaces(match: string): string {
  return match.replace(/\s+/gu, "");
}

function jsNormalizeUnicode(match: string): string {
  return match.normalize("NFC");
}

type JsFunction = (match: string) => string;

const JS_FUNCTION_MAP: Record<string, JsFunction> = {
  fullwidth: jsFullwidthToHalfwidth,
  halfwidth: jsHalfwidthToFullwidth,
  "全角": jsFullwidthToHalfwidth,
  "半角": jsHalfwidthToFullwidth,
  strip: jsStripSpaces,
  normalize: jsNormalizeUnicode,
};

function resolveJsReplacement(jsCode: string): JsFunction | null {
  const codeLower = jsCode.toLowerCase().trim();
  for (const [key, func] of Object.entries(JS_FUNCTION_MAP)) {
    if (codeLower.includes(key)) {
      return func;
    }
  }
  return null;
}

export function loadRulesFromJson(jsonStr: string): PurifyRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Rules must be a JSON array");
  }

  const mapping: Record<string, string> = {
    bookScope: "book_scope",
    excludeBookScope: "exclude_book_scope",
    group: "group",
    id: "external_id",
    isEnabled: "is_enabled",
    isRegex: "is_regex",
    name: "name",
    order: "order",
    pattern: "pattern",
    replacement: "replacement",
    scopeContent: "scope_content",
    scopeTitle: "scope_title",
  };

  const validated: PurifyRule[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const rule = parsed[i];
    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
      continue;
    }

    const raw = rule as Record<string, unknown>;
    const mappedRule: Record<string, unknown> = {};
    for (const [legacyKey, modelKey] of Object.entries(mapping)) {
      mappedRule[modelKey] = raw[legacyKey] ?? undefined;
    }

    if (!mappedRule["name"]) {
      mappedRule["name"] = `Imported Rule ${i}`;
    }
    if (mappedRule["order"] == null) {
      mappedRule["order"] = 10;
    }

    validated.push(mappedRule as unknown as PurifyRule);
  }

  return validated;
}

export function purify(
  text: string,
  rules: PurifyRule[],
  scope: string,
  bookTitle: string,
): string {
  if (!text || !rules || rules.length === 0) {
    debugLog('Purify', `skip: text=${!!text}, rules=${rules?.length ?? 0}`);
    return text;
  }

  let result = text.replace(/\r\n/g, "\n");

  const activeRules: PurifyRule[] = [];
  for (const r of rules) {
    const isEnabled = r.is_enabled ?? true;
    const ruleScopeTitle = r.scope_title ?? true;
    const ruleScopeContent = r.scope_content ?? true;

    if (!isEnabled) {
      continue;
    }

    if (scope === "title" && !ruleScopeTitle) {
      continue;
    }
    if (scope === "content" && !ruleScopeContent) {
      continue;
    }

    const bScope = r.book_scope ?? "";
    const eScope = r.exclude_book_scope ?? "";

    if (bScope && bookTitle && !bookTitle.includes(bScope)) {
      continue;
    }
    if (eScope && bookTitle && bookTitle.includes(eScope)) {
      continue;
    }

    activeRules.push(r);
  }

  activeRules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (activeRules.length === 0) {
    return result;
  }

  for (const rule of activeRules) {
    const pattern = rule.pattern ?? "";
    let replacement = rule.replacement ?? "";
    if (replacement === null) {
      replacement = "";
    }
    const isRegex = rule.is_regex ?? true;

    if (!pattern) {
      continue;
    }

    try {
      if (isRegex) {
        const compiled = new RegExp(pattern, "gu");

        if (replacement.startsWith("@js:")) {
          const jsCode = replacement.slice(4);
          const func = resolveJsReplacement(jsCode);
          if (func) {
            result = result.replace(compiled, (m) => func(m));
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
