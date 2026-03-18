import pytest
from flask import Flask
from unittest.mock import patch, MagicMock
from routes.settings import settings_bp


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(settings_bp, url_prefix='/api/settings')
    return app.test_client()


@patch('routes.settings.db_session')
def test_get_ai_settings(mock_db_session, client):
    mock_session = MagicMock()
    mock_db_session.return_value = mock_session
    mock_config = MagicMock()
    mock_session.query.return_value.filter_by.return_value.first.return_value = mock_config

    with patch('routes.settings.serialize_ai_provider_config', return_value={"apiBaseUrl": "http://test"}):
        res = client.get('/api/settings/ai-provider')
        assert res.status_code == 200
        assert res.json["apiBaseUrl"] == "http://test"


@patch('routes.settings.db_session')
@patch('routes.settings.save_ai_provider_config')
def test_save_ai_settings(mock_save, mock_db_session, client):
    mock_db_session.return_value = MagicMock()
    mock_save.return_value = MagicMock()
    with patch('routes.settings.serialize_ai_provider_config', return_value={"apiBaseUrl": "http://test"}):
        res = client.put('/api/settings/ai-provider', json={"apiBaseUrl": "http://test", "apiKey": "123", "modelName": "model"})
        assert res.status_code == 200
        assert res.json["apiBaseUrl"] == "http://test"


@patch('routes.settings.db_session')
@patch('routes.settings.build_runtime_config')
@patch('routes.settings.test_ai_provider_connection')
def test_test_ai_settings(mock_test_conn, mock_build_config, mock_db_session, client):
    mock_db_session.return_value = MagicMock()
    mock_build_config.return_value = MagicMock()
    mock_test_conn.return_value = {"message": "success", "preview": "ok"}
    res = client.post('/api/settings/ai-provider/test', json={"apiBaseUrl": "http://test", "apiKey": "123", "modelName": "model"})
    assert res.status_code == 200
    assert res.json["message"] == "success"
