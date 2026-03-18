import pytest
from flask import Flask
from unittest.mock import patch
from routes.analysis import analysis_bp


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(analysis_bp, url_prefix='/api')
    return app.test_client()


@patch('routes.analysis.db_session')
@patch('routes.analysis._ensure_novel_exists')
@patch('routes.analysis.get_analysis_status')
def test_get_status(mock_get_status, mock_ensure_novel_exists, mock_db_session, client):
    mock_db_session.return_value = Flask(__name__).app_context()  # never used directly
    mock_db_session.return_value.close = lambda: None
    mock_get_status.return_value = {"job": {"status": "running"}}
    res = client.get('/api/novels/1/analysis/status')
    assert res.status_code == 200
    assert res.json == {"job": {"status": "running"}}
    mock_ensure_novel_exists.assert_called_once()
    mock_get_status.assert_called_once_with(1)


@patch('routes.analysis.start_analysis')
def test_start_analysis(mock_start, client):
    mock_start.return_value = {"job": {"status": "running"}}
    res = client.post('/api/novels/2/analysis/start')
    assert res.status_code == 200
    mock_start.assert_called_once_with(2)


@patch('routes.analysis.pause_analysis')
def test_pause_analysis(mock_pause, client):
    mock_pause.return_value = {"job": {"status": "paused"}}
    res = client.post('/api/novels/2/analysis/pause')
    assert res.status_code == 200
    mock_pause.assert_called_once_with(2)


@patch('routes.analysis.resume_analysis')
def test_resume_analysis(mock_resume, client):
    mock_resume.return_value = {"job": {"status": "running"}}
    res = client.post('/api/novels/2/analysis/resume')
    assert res.status_code == 200


@patch('routes.analysis.restart_analysis')
def test_restart_analysis(mock_restart, client):
    mock_restart.return_value = {"job": {"status": "running"}}
    res = client.post('/api/novels/2/analysis/restart')
    assert res.status_code == 200


@patch('routes.analysis.refresh_overview')
def test_refresh_overview(mock_refresh, client):
    mock_refresh.return_value = {"job": {"status": "running"}}
    res = client.post('/api/novels/2/analysis/refresh-overview')
    assert res.status_code == 200
