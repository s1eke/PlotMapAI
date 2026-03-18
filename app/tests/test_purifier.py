import pytest
from services.purifier import purify, load_rules_from_json
import json

def test_purify_regex_replacement():
    rules = [
        {"id": 1, "name": "Ads", "pattern": r"Ads:.*", "replacement": "", "is_regex": True, "is_enabled": True, "scope_content": True, "order": 1}
    ]
    text = "Hello. Ads: buy now."
    result = purify(text, rules)
    assert result.strip() == "Hello."

def test_purify_js_replacement_fullwidth():
    # Test whitelisted @js:fullwidth
    rules = [
        {"id": 2, "name": "Fullwidth", "pattern": "[！，]", "replacement": "@js:fullwidth", "is_regex": True, "is_enabled": True, "scope_content": True, "order": 1}
    ]
    text = "Hello！World，"
    result = purify(text, rules)
    assert result == "Hello!World,"

def test_purify_scope_filtering():
    rules = [
        {"id": 3, "name": "Scope", "pattern": "FOO", "replacement": "BAR", "is_regex": False, "is_enabled": True, "scope_title": True, "scope_content": False, "order": 1}
    ]
    # Purify title
    assert purify("Original FOO", rules, scope="title") == "Original BAR"
    # Purify content
    assert purify("Original FOO", rules, scope="content") == "Original FOO"

def test_purify_order():
    rules = [
        {"id": 4, "name": "Rule 1", "pattern": "A", "replacement": "B", "is_regex": False, "is_enabled": True, "scope_content": True, "order": 2},
        {"id": 5, "name": "Rule 2", "pattern": "B", "replacement": "C", "is_regex": False, "is_enabled": True, "scope_content": True, "order": 1}
    ]
    # Order 1 (B->C) happens before Order 2 (A->B)
    # If text is "A", it stays "A" because B->C didn't find B. Then A->B turns it into "B".
    # Wait, if Order 1 is B->C and Order 2 is A->B:
    # Pass 1 (B->C): "A" -> "A"
    # Pass 2 (A->B): "A" -> "B"
    # Result: "B"
    assert purify("A", rules) == "B"
    
    # If Order 1 is A->B and Order 2 is B->C:
    rules2 = [
        {"id": 4, "name": "Rule 1", "pattern": "A", "replacement": "B", "is_regex": False, "is_enabled": True, "scope_content": True, "order": 1},
        {"id": 5, "name": "Rule 2", "pattern": "B", "replacement": "C", "is_regex": False, "is_enabled": True, "scope_content": True, "order": 2}
    ]
    # Pass 1 (A->B): "A" -> "B"
    # Pass 2 (B->C): "B" -> "C"
    # Result: "C"
    assert purify("A", rules2) == "C"

def test_purify_malicious_js():
    rules = [
        {"id": 6, "name": "Hack Regex", "pattern": "test", "replacement": "@js:alert(1)", "is_regex": True, "is_enabled": True, "scope_content": True, "order": 1}
    ]
    result = purify("test", rules)
    assert result == "test"

def test_load_rules_legacy_mapping():
    legacy_json = json.dumps([{
        "group": "group1",
        "id": 1,
        "isEnabled": False,
        "isRegex": False,
        "name": "Legacy Rule",
        "order": 5,
        "pattern": "foo",
        "replacement": "bar",
        "scopeContent": False,
        "scopeTitle": True
    }])
    rules = load_rules_from_json(legacy_json)
    assert len(rules) == 1
    r = rules[0]
    assert r["group"] == "group1"
    assert r["external_id"] == 1
    assert r["is_enabled"] is False
    assert r["is_regex"] is False
    assert r["name"] == "Legacy Rule"
    assert r["order"] == 5
    assert r["pattern"] == "foo"
    assert r["replacement"] == "bar"
    assert r["scope_content"] is False
    assert r["scope_title"] is True

def test_load_rules_defaults():
    minimal_json = json.dumps([{"pattern": "foo"}])
    rules = load_rules_from_json(minimal_json)
    r = rules[0]
    assert r["name"].startswith("Imported Rule")
    assert r["order"] == 10

def test_load_rules_invalid_json():
    with pytest.raises(ValueError, match="Invalid JSON"):
        load_rules_from_json("{bad json")
    
    with pytest.raises(ValueError, match="Rules must be a JSON array"):
        load_rules_from_json('{"key": "value"}')
