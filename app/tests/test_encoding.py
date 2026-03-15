import pytest
from services.encoding import detect_and_convert

def test_detect_and_convert_utf8():
    text = "Hello, 世界！"
    file_bytes = text.encode('utf-8')
    content, encoding = detect_and_convert(file_bytes)
    assert content == text
    assert encoding == 'utf-8'

def test_detect_and_convert_gbk():
    text = "这是中文GBK编码"
    file_bytes = text.encode('gbk')
    content, encoding = detect_and_convert(file_bytes)
    assert content == text
    assert 'gb' in encoding.lower() or 'gb18030' in encoding.lower()

def test_detect_and_convert_big5():
    text = "這是繁體BIG5編碼"
    file_bytes = text.encode('big5')
    content, encoding = detect_and_convert(file_bytes)
    assert content == text
    assert 'big5' in encoding.lower()

def test_detect_and_convert_utf16_le():
    text = "UTF-16 Little Endian 编码"
    file_bytes = text.encode('utf-16-le')
    # Prepend BOM
    file_bytes = b'\xff\xfe' + file_bytes
    content, encoding = detect_and_convert(file_bytes)
    assert content == text
    assert 'utf-16' in encoding.lower()

def test_detect_and_convert_empty():
    content, encoding = detect_and_convert(b'')
    assert content == ""
    assert encoding == 'utf-8' # Default for empty

def test_detect_and_convert_corrupted_fallback():
    # Mix of valid UTF-8 and invalid bytes
    file_bytes = b'Hello \xff\xfe World'
    content, encoding = detect_and_convert(file_bytes)
    assert 'Hello' in content
    assert 'World' in content
    assert encoding is not None
