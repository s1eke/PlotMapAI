import pytest
from flask import Flask
from unittest.mock import patch, MagicMock
from routes.novels import novels_bp
from io import BytesIO


@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(novels_bp, url_prefix='/api')
    return app.test_client()


@patch('routes.novels.db_session')
def test_get_novels_list(mock_db_session, client):
    mock_session = MagicMock()
    mock_db_session.return_value = mock_session
    mock_session.query.return_value.filter_by.return_value.order_by.return_value.all.return_value = []

    res = client.get('/api/novels')
    assert res.status_code == 200
    assert res.json == []


@patch('routes.novels.db_session')
@patch('routes.novels._handle_epub_upload')
def test_upload_epub(mock_handle_epub_upload, mock_db_session, client):
    mock_db_session.return_value = MagicMock()
    mock_handle_epub_upload.return_value = {
        "id": 1,
        "title": "Test",
        "author": "Author",
        "description": "Desc",
        "tags": [],
        "fileType": "epub",
        "hasCover": False,
        "originalFilename": "test.epub",
        "originalEncoding": "utf-8",
        "totalWords": 100,
        "createdAt": "2026-03-18T00:00:00Z",
    }

    data = {
        'file': (BytesIO(b"epub content"), 'test.epub')
    }
    res = client.post('/api/novels/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 201
    assert res.json["title"] == "Test"


@patch('routes.novels.db_session')
@patch('routes.novels._handle_txt_upload')
def test_upload_txt(mock_handle_txt_upload, mock_db_session, client):
    mock_db_session.return_value = MagicMock()
    mock_handle_txt_upload.return_value = {
        "id": 2,
        "title": "Test TXT",
        "author": "",
        "description": "",
        "tags": [],
        "fileType": "txt",
        "hasCover": False,
        "originalFilename": "test.txt",
        "originalEncoding": "utf-8",
        "totalWords": 10,
        "createdAt": "2026-03-18T00:00:00Z",
    }

    data = {
        'file': (BytesIO(b"txt content"), 'test.txt')
    }
    res = client.post('/api/novels/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 201
    assert res.json["title"] == "Test TXT"
