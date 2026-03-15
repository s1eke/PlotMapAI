"""TXT file parser.

Handles encoding detection, chapter detection, and content splitting for TXT files.
"""
import hashlib

from services.encoding import detect_and_convert
from services.chapter_detector import detect_chapters, split_by_chapters


def parse_txt(
    raw_bytes: bytes,
    filename: str,
    rules: list[dict],
) -> dict:
    """Parse a TXT file: detect encoding, find chapters, split content.

    Args:
        raw_bytes: Raw file content.
        filename: Original filename (used to derive title).
        rules: List of enabled TOC rule dicts.

    Returns:
        Dict with keys: title, chapters, raw_text, encoding, file_hash.
    """
    text, encoding = detect_and_convert(raw_bytes)

    # Derive title from filename (strip extension)
    title = filename
    if title.lower().endswith(".txt"):
        title = title[:-4]

    # Detect chapters using rules
    chapters_info = detect_chapters(text, rules)

    # Split into chapter chunks
    chapter_list = split_by_chapters(text, chapters_info)

    # Calculate total words and file hash
    total_words = sum(len(ch["content"]) for ch in chapter_list)
    file_hash = hashlib.sha256(raw_bytes).hexdigest()

    return {
        "title": title,
        "author": "",
        "description": "",
        "chapters": chapter_list,
        "raw_text": text,
        "encoding": encoding,
        "total_words": total_words,
        "file_hash": file_hash,
    }
