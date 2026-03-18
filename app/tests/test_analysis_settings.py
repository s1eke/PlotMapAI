import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask

import database
from routes.analysis import NOVEL_NOT_FOUND_ERROR, _handle_analysis_error
from routes.settings import _first_present, upload_purification_rules, upload_toc_rules
from services.analysis_runner import AnalysisJobStateError


class DummySession:
    def __init__(self):
        self.rules = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def query(self, _model):
        return DummyQuery(self)

    def add(self, rule):
        self.rules.append(rule)

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        return None


class DummyQuery:
    def __init__(self, session):
        self.session = session

    def filter_by(self, **_kwargs):
        return self

    def order_by(self, *_args):
        return self

    def delete(self):
        self.session.rules.clear()
        return 0

    def all(self):
        return list(self.session.rules)


def _unwrap_response(result):
    if isinstance(result, tuple):
        return result
    return result, result.status_code


class AnalysisSettingsTests(unittest.TestCase):
    def test_init_db_applies_schema_updates_before_seeding(self):
        calls = []

        with tempfile.TemporaryDirectory() as temp_dir:
            database_url = f"sqlite:///{Path(temp_dir) / 'plotmap-test.db'}"
            with patch.object(database.Config, "DATABASE_URL", database_url), \
                patch.object(database.Base.metadata, "create_all", side_effect=lambda **_kwargs: calls.append("create_all")), \
                patch.object(database, "_apply_schema_updates", side_effect=lambda: calls.append("schema")), \
                patch.object(database, "_seed_default_user", side_effect=lambda _session: calls.append("user")), \
                patch.object(database, "_seed_default_toc_rules", side_effect=lambda _session: calls.append("toc")), \
                patch.object(database, "db_session", side_effect=lambda: DummySession()):
                database.init_db()

        self.assertEqual(calls, ["create_all", "schema", "user", "toc"])

    def test_handle_analysis_error_maps_missing_novel_to_404(self):
        app = Flask(__name__)

        with app.app_context():
            response, status_code = _handle_analysis_error(AnalysisJobStateError(NOVEL_NOT_FOUND_ERROR))

        self.assertEqual(status_code, 404)
        self.assertEqual(response.get_json(), {"error": NOVEL_NOT_FOUND_ERROR})

    def test_first_present_keeps_falsey_values(self):
        data = {
            "priority": 0,
            "isEnabled": False,
        }

        self.assertEqual(_first_present(data, "priority", "serial_number", default=99), 0)
        self.assertIs(_first_present(data, "isEnabled", "enable", default=True), False)

    def test_upload_toc_rules_preserves_falsey_values(self):
        app = Flask(__name__)
        session = DummySession()
        payload = [{
            "name": "Rule A",
            "rule": "^第.+章$",
            "priority": 0,
            "isEnabled": False,
        }]

        with patch("routes.settings.db_session", side_effect=lambda: session):
            with app.test_request_context("/api/settings/toc-rules/upload", method="POST", json=payload):
                response, status_code = _unwrap_response(upload_toc_rules())

        self.assertEqual(status_code, 201)
        self.assertEqual(response.get_json(), [{
            "id": None,
            "name": "Rule A",
            "rule": "^第.+章$",
            "example": "",
            "priority": 0,
            "isEnabled": False,
            "isDefault": False,
            "createdAt": None,
        }])

    def test_upload_purification_rules_accepts_raw_json_array(self):
        app = Flask(__name__)
        session = DummySession()
        captured = {}
        payload = [{"name": "Rule 1", "pattern": "foo"}]

        def fake_load_rules_from_json(json_str: str):
            captured["json_str"] = json_str
            return []

        with patch("routes.settings.db_session", side_effect=lambda: session), \
            patch("routes.settings.load_rules_from_json", side_effect=fake_load_rules_from_json):
            with app.test_request_context("/api/settings/purification-rules/upload", method="POST", json=payload):
                response, status_code = _unwrap_response(upload_purification_rules())

        self.assertEqual(status_code, 201)
        self.assertEqual(response.get_json(), [])
        self.assertEqual(captured["json_str"], json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
