"""Encoding detection and conversion service.

Detects the encoding of raw bytes and converts to UTF-8.
Uses chardet with a fallback chain for low-confidence results.
"""
import chardet

# Fallback encodings to try when chardet confidence is low
# Note: big5 is usually stricter than gb18030 (which can decode almost anything without error), 
# so 'big5' must come before 'gb18030' in the fallback chain to prevent false positives.
_FALLBACK_ENCODINGS = ["utf-8", "gbk", "big5", "gb18030", "utf-16le", "utf-16be"]


def detect_and_convert(raw_bytes: bytes) -> tuple[str, str]:
    """Detect encoding of raw bytes and return (utf8_text, detected_encoding).

    Args:
        raw_bytes: The raw file content bytes.

    Returns:
        A tuple of (converted UTF-8 text, detected encoding name).

    Raises:
        UnicodeDecodeError: If no encoding can decode the content.
    """
    if not raw_bytes:
        return "", "utf-8"

    # Check for BOM markers first
    if raw_bytes[:3] == b"\xef\xbb\xbf":
        return raw_bytes[3:].decode("utf-8"), "utf-8-bom"
    if raw_bytes[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw_bytes.decode("utf-16"), "utf-16"

    # Use chardet for detection
    result = chardet.detect(raw_bytes)
    detected = result.get("encoding", "")
    confidence = result.get("confidence", 0)

    # If chardet has some confidence (>0.5), we should try its suggestion first before the blind fallback chain
    if detected:
        encoding = _normalize_encoding(detected)
        # Try if confidence is high, or if it's one of our expected fallbacks (even at low confidence)
        if confidence >= 0.5 or encoding in [e.lower() for e in _FALLBACK_ENCODINGS]:
            try:
                # Need special handling for big5 false positives from chardet sometimes, but 
                # we'll rely on the decode errors
                text = raw_bytes.decode(encoding)
                if encoding != 'big5' or '\ufffd' not in text:
                    return text, encoding
            except (UnicodeDecodeError, LookupError):
                pass

    # Low confidence or decode failed: try fallback chain
    for enc in _FALLBACK_ENCODINGS:
        try:
            text = raw_bytes.decode(enc)
            
            # Heuristics to reject false positive decodings
            if enc.startswith("utf-16"):
                # UTF-16 decoding of ASCII/UTF-8 often results in alternating null bytes or rare Chinese characters
                # If there are many ASCII characters in the original bytes but virtually none in the decoded text
                ascii_count_bytes = sum(1 for b in raw_bytes if b < 128)
                ascii_count_text = sum(1 for c in text if ord(c) < 128)
                
                # If original had >20% ASCII, but decoded has <5% ASCII, it's likely a false positive
                if len(raw_bytes) > 0 and (ascii_count_bytes / len(raw_bytes)) > 0.2:
                    if len(text) > 0 and (ascii_count_text / len(text)) < 0.05:
                        continue
                
                if text.count('\x00') > 0 or '\ufffd' in text:
                    continue
                    
            if enc == "big5":
                 # Big5 decoding of GBK often succeeds but produces mangled text (mojibake)
                 # However, detecting mojibake algorithmically is hard without a dictionary.
                 # Python's strict big5 decoder usually catches invalid bytes.
                 if '\ufffd' in text:
                     continue
            
            return text, enc
        except (UnicodeDecodeError, LookupError):
            continue

    # Last resort: decode with replacement characters
    return raw_bytes.decode("utf-8", errors="replace"), "utf-8"


def _normalize_encoding(encoding: str) -> str:
    """Normalize encoding name to Python-compatible codec name."""
    mapping = {
        "gb2312": "gbk",
        "ascii": "utf-8",
        "iso-8859-1": "utf-8",
        "windows-1252": "utf-8",
    }
    return mapping.get(encoding.lower(), encoding.lower())
