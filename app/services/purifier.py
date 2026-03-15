"""Purification rules engine.

Applies text replacement rules (regex-based) to chapter content/titles.
Supports scope filtering (scopeTitle/scopeContent) and @js: replacements
via a strict whitelist of safe functions.

SECURITY: @js: replacement content is NOT executed as arbitrary JavaScript.
Instead, only a predefined set of safe transformations is allowed.
"""
import json
import regex as re
import unicodedata
from typing import Optional


# ---------------------------------------------------------------------------
# Safe @js: function whitelist
# ---------------------------------------------------------------------------

def _js_fullwidth_to_halfwidth(match: re.Match) -> str:
    """Convert fullwidth characters to halfwidth."""
    text = match.group(0)
    result = []
    for ch in text:
        code = ord(ch)
        if 0xFF01 <= code <= 0xFF5E:
            result.append(chr(code - 0xFEE0))
        elif code == 0x3000:
            result.append(" ")
        else:
            result.append(ch)
    return "".join(result)


def _js_halfwidth_to_fullwidth(match: re.Match) -> str:
    """Convert halfwidth characters to fullwidth."""
    text = match.group(0)
    result = []
    for ch in text:
        code = ord(ch)
        if 0x21 <= code <= 0x7E:
            result.append(chr(code + 0xFEE0))
        elif code == 0x20:
            result.append("\u3000")
        else:
            result.append(ch)
    return "".join(result)


def _js_strip_spaces(match: re.Match) -> str:
    """Remove all whitespace from matched text."""
    return re.sub(r"\s+", "", match.group(0))


def _js_normalize_unicode(match: re.Match) -> str:
    """Normalize Unicode characters to NFC form."""
    return unicodedata.normalize("NFC", match.group(0))


# Map of recognized @js: function 'signatures' to Python implementations
_JS_FUNCTION_MAP: dict[str, callable] = {
    "fullwidth": _js_fullwidth_to_halfwidth,
    "halfwidth": _js_halfwidth_to_fullwidth,
    "全角": _js_fullwidth_to_halfwidth,
    "半角": _js_halfwidth_to_fullwidth,
    "strip": _js_strip_spaces,
    "normalize": _js_normalize_unicode,
}


def _resolve_js_replacement(js_code: str) -> Optional[callable]:
    """Try to match @js: code to a safe whitelisted function.

    Returns a callable(match) -> str, or None if the code is not recognized.
    """
    code_lower = js_code.lower().strip()
    for key, func in _JS_FUNCTION_MAP.items():
        if key in code_lower:
            return func
    return None


# ---------------------------------------------------------------------------
# Main purification engine
# ---------------------------------------------------------------------------

def load_rules_from_json(json_str: str) -> list[dict]:
    """Parse and validate Legado-style purification rules JSON.

    Args:
        json_str: JSON string containing an array of rule objects.

    Returns:
        List of dicts mapped to PurificationRule fields.
    """
    try:
        rules = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}")

    if not isinstance(rules, list):
        raise ValueError("Rules must be a JSON array")

    # Legado fields -> PurificationRule fields
    mapping = {
        "group": "group",
        "id": "external_id",
        "isEnabled": "is_enabled",
        "isRegex": "is_regex",
        "name": "name",
        "order": "order",
        "pattern": "pattern",
        "replacement": "replacement",
        "scopeContent": "scope_content",
        "scopeTitle": "scope_title"
    }

    validated = []
    for i, rule in enumerate(rules):
        if not isinstance(rule, dict):
            continue

        mapped_rule = {}
        for legacy_key, model_key in mapping.items():
            mapped_rule[model_key] = rule.get(legacy_key)
        
        # Defaults for missing critical fields
        if not mapped_rule.get("name"):
            mapped_rule["name"] = f"Imported Rule {i}"
        if mapped_rule.get("order") is None:
            mapped_rule["order"] = 10
            
        validated.append(mapped_rule)

    return validated


def purify(text: str, rules: list, scope: str = "content", book_title: str = "") -> str:
    """Apply purification rules to text in a sequential pipeline.

    Args:
        text: The text to purify.
        rules: List of PurificationRule objects or dicts.
        scope: "content" or "title".
        book_title: Current novel title for scope filtering.

    Returns:
        Purified text string.
    """
    if not text or not rules:
        return text

    # Normalize to LF for consistency across rules
    result = text.replace("\r\n", "\n")

    # Filter and sort rules
    active_rules = []
    for r in rules:
        # Support both ORM objects and dicts (for tests)
        is_enabled = getattr(r, "is_enabled", True) if not isinstance(r, dict) else r.get("is_enabled", True)
        rule_scope_title = getattr(r, "scope_title", True) if not isinstance(r, dict) else r.get("scope_title", True)
        rule_scope_content = getattr(r, "scope_content", True) if not isinstance(r, dict) else r.get("scope_content", True)
        
        if not is_enabled:
            continue
            
        # Scope check (Title/Content)
        if scope == "title" and not rule_scope_title:
            continue
        if scope == "content" and not rule_scope_content:
            continue
            
        # Novel Title Scope check (Whitelist/Blacklist)
        b_scope = getattr(r, "book_scope", "") if not isinstance(r, dict) else r.get("book_scope", "")
        e_scope = getattr(r, "exclude_book_scope", "") if not isinstance(r, dict) else r.get("exclude_book_scope", "")
        
        if b_scope and book_title and b_scope not in book_title:
            continue
        if e_scope and book_title and e_scope in book_title:
            continue
            
        active_rules.append(r)

    # Sort by 'order' field
    active_rules.sort(key=lambda x: getattr(x, "order", 0) if not isinstance(x, dict) else x.get("order", 0))

    if not active_rules:
        return result

    # Apply each rule in order
    for rule in active_rules:
        name = getattr(rule, "name", "Unnamed")
        pattern = getattr(rule, "pattern", "") if not isinstance(rule, dict) else rule.get("pattern", "")
        replacement = getattr(rule, "replacement", "") if not isinstance(rule, dict) else rule.get("replacement", "")
        if replacement is None:
            replacement = ""
            
        is_regex = getattr(rule, "is_regex", True) if not isinstance(rule, dict) else rule.get("is_regex", True)

        if not pattern:
            continue

        try:
            if is_regex:
                # regex library supports advanced features natively
                compiled = re.compile(pattern, re.MULTILINE | re.UNICODE)

                if replacement.startswith("@js:"):
                    # Attempt to resolve to a safe builtin function
                    js_code = replacement[4:]
                    func = _resolve_js_replacement(js_code)
                    if func:
                        result = compiled.sub(func, result)
                    # SECURITY: skip unrecognized @js: code
                else:
                    # Convert JS-style $1, $2 to Python \g<1>, \g<2>
                    # Also handle $0 as \g<0>
                    py_replacement = re.sub(r"\$(\d+)", lambda m: f"\\g<{m.group(1)}>", replacement)
                    result = compiled.sub(py_replacement, result)
            else:
                result = result.replace(pattern, replacement)
        except Exception as e:
            # print(f"Error applying rule '{name}': {e}")
            continue

    return result
