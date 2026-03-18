import pytest
from flask import Flask
from unittest.mock import patch, MagicMock
from routes.reader import reader_bp

@pytest.fixture
def client():
    app = Flask(__name__)
    app.register_blueprint(reader_bp, url_prefix='/api')
    return app.test_client()

@patch('routes.reader.db_session')
@patch('routes.reader.purify', side_effect=lambda text, *_args, **_kwargs: text)
def test_get_novel_chapters(_mock_purify, mock_db_session, client):
    mock_session = MagicMock()
    mock_db_session.return_value = mock_session

    novel_query = MagicMock()
    novel_query.filter_by.return_value.first.return_value = MagicMock(title="Novel")

    chapter_query = MagicMock()
    chapter_query.filter_by.return_value.order_by.return_value.all.return_value = [
        MagicMock(chapter_index=0, title="Chapter 1", word_count=1200),
        MagicMock(chapter_index=1, title="Chapter 2", word_count=980),
    ]

    rule_query = MagicMock()
    rule_query.filter_by.return_value.order_by.return_value.all.return_value = []

    mock_session.query.side_effect = [novel_query, chapter_query, rule_query]

    res = client.get('/api/novels/1/chapters')
    assert res.status_code == 200
    assert len(res.json) == 2
    assert res.json[0]["title"] == "Chapter 1"

@patch('routes.reader.db_session')
@patch('routes.reader.purify', side_effect=lambda text, *_args, **_kwargs: text)
def test_get_chapter_detail(_mock_purify, mock_db_session, client):
    mock_session = MagicMock()
    mock_db_session.return_value = mock_session

    novel_query = MagicMock()
    novel_query.filter_by.return_value.first.return_value = MagicMock(title="Novel")

    chapter_query = MagicMock()
    chapter_query.filter_by.return_value.first.return_value = MagicMock(
        chapter_index=1,
        title="Chapter 2",
        content="Text content",
    )

    rule_query = MagicMock()
    rule_query.filter_by.return_value.order_by.return_value.all.return_value = []

    count_query = MagicMock()
    count_query.filter_by.return_value.count.return_value = 3

    mock_session.query.side_effect = [novel_query, chapter_query, rule_query, count_query]

    res = client.get('/api/novels/1/chapters/1')
    assert res.status_code == 200
    assert res.json["index"] == 1
    assert res.json["title"] == "Chapter 2"
    assert res.json["content"] == "Text content"
    assert res.json["totalChapters"] == 3

@patch('routes.reader.db_session')
def test_get_raw_text(mock_db_session, client):
    mock_session = MagicMock()
    mock_db_session.return_value = mock_session

    progress_query = MagicMock()
    progress_query.filter_by.return_value.first.return_value = MagicMock(
        chapter_index=2,
        scroll_position=320,
        view_mode="summary",
    )
    mock_session.query.return_value = progress_query

    res = client.get('/api/novels/1/reading-progress')
    assert res.status_code == 200
    assert res.json["chapterIndex"] == 2
    assert res.json["scrollPosition"] == 320
    assert res.json["viewMode"] == "summary"
