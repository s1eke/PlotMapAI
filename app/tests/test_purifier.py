import pytest
from services.purifier import purify

def test_purify_regex_replacement():
    rules = [
        {"id": 1, "name": "Ads", "pattern": r"Ads:.*", "replacement": "", "isRegex": True, "isEnabled": True, "scopeContent": True, "order": 1}
    ]
    text = "Hello. Ads: buy now."
    result = purify(text, rules)
    assert result.strip() == "Hello."

def test_purify_js_replacement_fullwidth():
    # Test whitelisted @js:fullwidth
    rules = [
        {"id": 2, "name": "Fullwidth", "pattern": "[！，]", "replacement": "@js:fullwidth", "isRegex": True, "isEnabled": True, "scopeContent": True, "order": 1}
    ]
    text = "Hello！World，"
    result = purify(text, rules)
    assert result == "Hello!World,"

def test_purify_scope_filtering():
    rules = [
        {"id": 3, "name": "Scope", "pattern": "FOO", "replacement": "BAR", "isRegex": False, "isEnabled": True, "scopeTitle": True, "scopeContent": False, "order": 1}
    ]
    # Purify title
    assert purify("Original FOO", rules, scope="title") == "Original BAR"
    # Purify content
    assert purify("Original FOO", rules, scope="content") == "Original FOO"

def test_purify_order():
    rules = [
        {"id": 4, "name": "Rule 1", "pattern": "A", "replacement": "B", "isRegex": False, "isEnabled": True, "scopeContent": True, "order": 2},
        {"id": 5, "name": "Rule 2", "pattern": "B", "replacement": "C", "isRegex": False, "isEnabled": True, "scopeContent": True, "order": 1}
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
        {"id": 4, "name": "Rule 1", "pattern": "A", "replacement": "B", "isRegex": False, "isEnabled": True, "scopeContent": True, "order": 1},
        {"id": 5, "name": "Rule 2", "pattern": "B", "replacement": "C", "isRegex": False, "isEnabled": True, "scopeContent": True, "order": 2}
    ]
    # Pass 1 (A->B): "A" -> "B"
    # Pass 2 (B->C): "B" -> "C"
    # Result: "C"
    assert purify("A", rules2) == "C"

def test_purify_malicious_js():
    rules = [
        {"id": 6, "name": "Hack Regex", "pattern": "test", "replacement": "@js:alert(1)", "isRegex": True, "isEnabled": True, "scopeContent": True, "order": 1}
    ]
    result = purify("test", rules)
    assert result == "test"
