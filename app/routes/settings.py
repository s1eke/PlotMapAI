"""Settings API routes: TOC rules and purification rules management."""
import json

from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session

from config import Config
from database import db_session, _seed_default_toc_rules
from models import TocRule, PurificationRuleSet, PurificationRule
from services.purifier import load_rules_from_json

settings_bp = Blueprint("settings", __name__)


# ---------------------------------------------------------------------------
# TOC Rules
# ---------------------------------------------------------------------------

@settings_bp.route("/toc-rules", methods=["GET"])
def list_toc_rules():
    """Get all TOC rules."""
    session: Session = db_session()
    try:
        rules = (
            session.query(TocRule)
            .filter_by(user_id=Config.DEFAULT_USER_ID)
            .order_by(TocRule.serial_number)
            .all()
        )
        return jsonify([_toc_rule_to_dict(r) for r in rules])
    finally:
        session.close()


@settings_bp.route("/toc-rules", methods=["POST"])
def create_toc_rule():
    """Add a custom TOC rule."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    required = ["name", "rule"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    session: Session = db_session()
    try:
        # Auto-assign serial_number
        max_sn = (
            session.query(TocRule.serial_number)
            .filter_by(user_id=Config.DEFAULT_USER_ID)
            .order_by(TocRule.serial_number.desc())
            .first()
        )
        serial = (max_sn[0] + 1) if max_sn else 0

        rule = TocRule(
            name=data["name"],
            rule=data["rule"],
            example=data.get("example", ""),
            serial_number=data.get("priority", serial),
            enable=data.get("isEnabled", True),
            is_default=False,
            user_id=Config.DEFAULT_USER_ID,
        )
        session.add(rule)
        session.commit()
        return jsonify(_toc_rule_to_dict(rule)), 201
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@settings_bp.route("/toc-rules/<int:rule_id>", methods=["PUT"])
def update_toc_rule(rule_id: int):
    """Update a TOC rule (name, regex, enable state, etc.)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    session: Session = db_session()
    try:
        rule = session.query(TocRule).filter_by(
            id=rule_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not rule:
            return jsonify({"error": "Rule not found"}), 404

        if "name" in data:
            rule.name = data["name"]
        if "rule" in data:
            rule.rule = data["rule"]
        if "example" in data:
            rule.example = data["example"]
        if "isEnabled" in data:
            rule.enable = data["isEnabled"]
        if "priority" in data:
            rule.serial_number = data["priority"]

        session.commit()
        return jsonify(_toc_rule_to_dict(rule))
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@settings_bp.route("/toc-rules/<int:rule_id>", methods=["DELETE"])
def delete_toc_rule(rule_id: int):
    """Delete a custom TOC rule. Default rules cannot be deleted."""
    session: Session = db_session()
    try:
        rule = session.query(TocRule).filter_by(
            id=rule_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not rule:
            return jsonify({"error": "Rule not found"}), 404
        if rule.is_default:
            return jsonify({"error": "Cannot delete default rules"}), 403

        session.delete(rule)
        session.commit()
        return jsonify({"message": "Rule deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@settings_bp.route("/toc-rules/reset", methods=["POST"])
def reset_toc_rules():
    """Reset all TOC rules to defaults."""
    session: Session = db_session()
    try:
        session.query(TocRule).filter_by(user_id=Config.DEFAULT_USER_ID).delete()
        session.commit()
        _seed_default_toc_rules()
        return jsonify({"message": "Rules reset to defaults"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Purification Rules
# ---------------------------------------------------------------------------

@settings_bp.route("/purification-rules", methods=["GET"])
def list_purification_rules():
    """Get all individual purification rules grouped by group."""
    session: Session = db_session()
    try:
        rules = (
            session.query(PurificationRule)
            .filter_by(user_id=Config.DEFAULT_USER_ID)
            .order_by(PurificationRule.group, PurificationRule.order)
            .all()
        )
        return jsonify([_purification_rule_to_dict(r) for r in rules])
    finally:
        session.close()


@settings_bp.route("/purification-rules/upload", methods=["POST"])
def upload_purification_rules():
    """Upload Legado JSON and import as individual rules."""
    if "file" in request.files:
        file = request.files["file"]
        json_str = file.read().decode("utf-8")
    elif request.is_json:
        data = request.get_json()
        json_str = json.dumps(data.get("rules", []), ensure_ascii=False)
    else:
        return jsonify({"error": "No rules data provided"}), 400

    try:
        rule_data_list = load_rules_from_json(json_str)
    except ValueError as e:
        return jsonify({"error": f"Invalid rules format: {e}"}), 400

    session: Session = db_session()
    try:
        new_rules = []
        for rd in rule_data_list:
            rule = PurificationRule(
                user_id=Config.DEFAULT_USER_ID,
                external_id=rd.get("external_id"),
                name=rd.get("name"),
                group=rd.get("group", "默认"),
                pattern=rd.get("pattern"),
                replacement=rd.get("replacement", ""),
                is_regex=rd.get("is_regex", True),
                is_enabled=rd.get("is_enabled", True),
                order=rd.get("order", 10),
                scope_title=rd.get("scope_title", True),
                scope_content=rd.get("scope_content", True),
            )
            session.add(rule)
            new_rules.append(rule)
        
        session.commit()
        return jsonify([_purification_rule_to_dict(r) for r in new_rules]), 201
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@settings_bp.route("/purification-rules", methods=["POST"])
def create_purification_rule():
    """Manually add a single purification rule."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    required = ["name", "pattern"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    session: Session = db_session()
    try:
        rule = PurificationRule(
            user_id=Config.DEFAULT_USER_ID,
            name=data["name"],
            group=data.get("group", "默认"),
            pattern=data["pattern"],
            replacement=data.get("replacement", ""),
            is_regex=data.get("isRegex", True),
            is_enabled=data.get("isEnabled", True),
            order=data.get("order", 10),
            scope_title=data.get("scopeTitle", True),
            scope_content=data.get("scopeContent", True),
            book_scope=data.get("bookScope", ""),
            exclude_book_scope=data.get("excludeBookScope", ""),
            timeout_ms=data.get("timeoutMs", 3000),
        )
        session.add(rule)
        session.commit()
        return jsonify(_purification_rule_to_dict(rule)), 201
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@settings_bp.route("/purification-rules/<int:rule_id>", methods=["PUT"])
def update_purification_rule(rule_id: int):
    """Update an individual purification rule."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    session: Session = db_session()
    try:
        rule = session.query(PurificationRule).filter_by(
            id=rule_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not rule:
            return jsonify({"error": "Rule not found"}), 404

        # Map frontend camelCase to backend snake_case
        field_map = {
            "name": "name",
            "group": "group",
            "pattern": "pattern",
            "replacement": "replacement",
            "isRegex": "is_regex",
            "isEnabled": "is_enabled",
            "order": "order",
            "scopeTitle": "scope_title",
            "scopeContent": "scope_content",
            "bookScope": "book_scope",
            "excludeBookScope": "exclude_book_scope",
            "timeoutMs": "timeout_ms",
        }

        for json_key, attr in field_map.items():
            if json_key in data:
                setattr(rule, attr, data[json_key])

        session.commit()
        return jsonify(_purification_rule_to_dict(rule))
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@settings_bp.route("/purification-rules/<int:rule_id>", methods=["DELETE"])
def delete_purification_rule(rule_id: int):
    """Delete a specific purification rule."""
    session: Session = db_session()
    try:
        rule = session.query(PurificationRule).filter_by(
            id=rule_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not rule:
            return jsonify({"error": "Rule not found"}), 404

        session.delete(rule)
        session.commit()
        return jsonify({"message": "Rule deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _toc_rule_to_dict(rule: TocRule) -> dict:
    return {
        "id": rule.id,
        "name": rule.name,
        "rule": rule.rule,
        "example": rule.example,
        "priority": rule.serial_number,
        "isEnabled": rule.enable,
        "isDefault": rule.is_default,
        "createdAt": rule.created_at.isoformat() if rule.created_at else None,
    }


def _purification_rule_to_dict(rule: PurificationRule) -> dict:
    return {
        "id": rule.id,
        "externalId": rule.external_id,
        "name": rule.name,
        "group": rule.group,
        "pattern": rule.pattern,
        "replacement": rule.replacement,
        "isRegex": rule.is_regex,
        "isEnabled": rule.is_enabled,
        "order": rule.order,
        "scopeTitle": rule.scope_title,
        "scopeContent": rule.scope_content,
        "bookScope": rule.book_scope,
        "excludeBookScope": rule.exclude_book_scope,
        "timeoutMs": rule.timeout_ms,
        "createdAt": rule.created_at.isoformat() if rule.created_at else None,
    }
