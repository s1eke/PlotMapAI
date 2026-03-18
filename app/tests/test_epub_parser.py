from unittest.mock import patch, MagicMock
from services.epub_parser import parse_epub, _html_to_text, _extract_title_from_html

def test_html_to_text():
    html = "<html><body><h1>Title</h1><p>Some <br> text.</p><script>bad</script></body></html>"
    text = _html_to_text(html)
    assert "Title" in text
    assert "Some \n text." in text
    assert "bad" not in text

def test_extract_title_from_html():
    html = "<html><title>  Book Title  </title></html>"
    assert _extract_title_from_html(html) == "Book Title"
    
    html = "<html><h1> Chapter 2 </h1></html>"
    assert _extract_title_from_html(html) == "Chapter 2"
    
    assert _extract_title_from_html("no title") == ""

@patch("services.epub_parser.epub.read_epub")
@patch("builtins.open")
def test_parse_epub_metadata_missing(mock_open, mock_read_epub):
    mock_book = MagicMock()
    # Mock missing metadata
    mock_book.get_metadata.return_value = []
    mock_book.toc = []
    # Mock 1 chapter
    mock_item = MagicMock()
    mock_item.get_content.return_value = b"<p>Text</p>"
    mock_book.get_items_of_type.return_value = [mock_item]
    mock_read_epub.return_value = mock_book
    mock_open.return_value.__enter__.return_value.read.return_value = b""
    
    res = parse_epub("test.epub")
    assert res["title"] == "test" # falls back to stem
    assert res["author"] == ""
    assert len(res["chapters"]) == 1
    assert res["chapters"][0]["title"] == "Chapter 1"

@patch("services.epub_parser.epub.read_epub")
@patch("builtins.open")
def test_parse_epub_cover_branches(mock_open, mock_read_epub):
    # Tests the various branches for _extract_cover fallback
    from services.epub_parser import _extract_cover
    
    mock_book = MagicMock()
    mock_cover_item = MagicMock()
    mock_cover_item.get_name.return_value = "cover.jpg"
    
    # 1. OPF cover
    mock_book.get_metadata.return_value = [("cover", {"content": "cover-id"})]
    mock_cover_item.get_id.return_value = "cover-id"
    mock_book.get_items.return_value = [mock_cover_item]
    path = _extract_cover(mock_book, "/tmp", "test")
    assert path == "/tmp/test_cover.jpg"
    
    # 2. Name contains cover
    mock_book.get_metadata.return_value = [] # no OPF
    mock_cover_item.get_id.return_value = "img"
    mock_cover_item.get_name.return_value = "MyCover.png"
    mock_book.get_items_of_type.return_value = [mock_cover_item]
    path = _extract_cover(mock_book, "/tmp", "test")
    assert path == "/tmp/test_cover.png"
    
    # 3. Fallback to first image
    mock_cover_item.get_name.return_value = "image1.jpg"
    path = _extract_cover(mock_book, "/tmp", "test")
    assert path == "/tmp/test_cover.jpg"
