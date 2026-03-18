from services.txt_parser import parse_txt

def test_parse_txt_empty():
    res = parse_txt(b"", "empty.txt", [])
    assert res["title"] == "empty"
    assert res["raw_text"] == ""
    assert res["total_words"] == 0
    assert len(res["chapters"]) == 0

def test_parse_txt_single_chapter():
    res = parse_txt(b"Just some text without chapters.", "book.txt", [])
    assert res["title"] == "book"
    assert len(res["chapters"]) == 1
    assert res["chapters"][0]["title"] == "第1部分"
    assert "Just some" in res["chapters"][0]["content"]

def test_parse_txt_multi_chapter():
    text = "Intro\n\n\n第1章 \nChap 1 content.\n第2章 \nChap 2 content."
    rules = [{"rule": "第\\d+章", "priority": 1, "isEnabled": True, "name": "rule"}]
    res = parse_txt(text.encode("utf-8"), "multi.txt", rules)
    assert len(res["chapters"]) == 3
    assert res["title"] == "multi"
    assert res["chapters"][1]["title"] == "第1章"
    assert "Chap 1 content." in res["chapters"][1]["content"]

def test_parse_txt_different_encoding():
    text = "这是一段中文测试内容。".encode("gb18030")
    res = parse_txt(text, "book.txt", [])
    assert res["encoding"].lower() in {"gb2312", "gbk", "gb18030", "windows-1254", "euc-kr", "iso-8859-9", "maccyrillic", "iso-8859-1"}
    assert "这是一段中文测试内容" in res["raw_text"]
