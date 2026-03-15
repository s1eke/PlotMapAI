import pytest
from services.chapter_detector import detect_chapters, split_by_chapters, ChapterInfo
from models import TocRule

@pytest.fixture
def default_rules():
    # A small subset of common rules for testing
    return [
        TocRule(
            id=1,
            name="第x章",
            rule=r"^\s*第[零一二三四五六七八九十百千万0-9]{1,7}[章回节集卷部篇][ \t]*.*",
            serial_number=1,
            enable=True
        ),
        TocRule(
            id=2,
            name="Chapter x",
            rule=r"^\s*[Cc]hapter[ \t]*\d+[ \t]*.*",
            serial_number=2,
            enable=True
        )
    ]

def test_detect_chapters_basic(default_rules):
    text = """Preface text here
    More preface
    第一章 开始的地方
    这是第一章正文
    第二章 发展
    这是第二章正文
    """
    chapters = detect_chapters(text, default_rules)
    assert len(chapters) == 3
    
    assert chapters[0].title == "前言"
    assert chapters[1].title == "第一章 开始的地方"
    assert chapters[2].title == "第二章 发展"
    
    # Check boundaries
    lines = text.splitlines()
    assert "Preface" in "\n".join(lines[chapters[0].start:chapters[0].end])
    assert "第一章正文" in "\n".join(lines[chapters[1].start:chapters[1].end])

def test_split_by_chapters_no_match():
    # If no rules match, split_by_chapters should return part 1, part 2 etc or "正文"
    text = "Some text without chapters."
    chunks = split_by_chapters(text, [], max_chunk_size=100)
    assert len(chunks) == 1
    assert chunks[0]["title"] == "第1部分"
    assert chunks[0]["content"] == "Some text without chapters."

def test_split_by_chapters_huge_no_match():
    # Text > chunk size should be split
    text = "a" * 150
    chunks = split_by_chapters(text, [], max_chunk_size=100)
    assert len(chunks) == 2
    assert chunks[0]["title"] == "第1部分"
    assert chunks[1]["title"] == "第2部分"

def test_split_by_chapters_oversized_chapter(default_rules):
    text = "第一章\n" + "o" * 150
    chapters = detect_chapters(text, default_rules)
    chunks = split_by_chapters(text, chapters, max_chunk_size=100)
    # Should split "第一章" into sub-chunks
    assert len(chunks) == 2
    assert chunks[0]["title"] == "第一章 (1)"
    assert chunks[1]["title"] == "第一章 (2)"

def test_custom_rule(default_rules):
    # Test priority or just matching
    custom = {
        "id": 10,
        "name": "Custom",
        "rule": r"^【.*?】",
        "serial_number": 0,
        "enable": True
    }
    # We pass dict to see if it works with my recent fix
    text = "【分卷一】\nContent"
    chapters = detect_chapters(text, [custom])
    assert len(chapters) == 1
    assert chapters[0].title == "【分卷一】"
