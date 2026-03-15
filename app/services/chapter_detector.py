"""Chapter detection engine using configurable regex rules.

Matches chapter headings line-by-line against enabled TOC rules,
returns structured chapter boundaries for content splitting.
"""
import re
from dataclasses import dataclass


@dataclass
class ChapterInfo:
    title: str
    start: int  # inclusive line index
    end: int    # exclusive line index


def detect_chapters(text: str, rules: list[dict]) -> list[ChapterInfo]:
    """Detect chapter boundaries in text using the provided rules.

    Args:
        text: Full text content.
        rules: List of rule dicts with 'rule' (regex) and 'serial_number' keys,
               sorted by serial_number and filtered to enabled rules only.

    Returns:
        List of ChapterInfo with title, start line, and end line.
    """
    if not text or not rules:
        return []

    lines = text.splitlines()
    compiled_rules = []
    for r in rules:
        # Handle both dicts (from tests/JSON) and objects (from SQLAlchemy)
        pattern = getattr(r, "rule", None)
        if pattern is None and isinstance(r, dict):
            pattern = r.get("rule", "")
            
        if not pattern:
            continue
        try:
            compiled_rules.append(re.compile(pattern, re.MULTILINE))
        except re.error:
            continue  # Skip invalid regexes silently

    if not compiled_rules:
        return []

    # Find all chapter-heading lines
    chapter_positions: list[tuple[int, str]] = []  # (line_index, title)
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        for pattern in compiled_rules:
            if pattern.search(line):
                chapter_positions.append((i, stripped))
                break  # First matching rule wins (priority by order)

    if not chapter_positions:
        return []

    # Build chapter boundary list
    chapters: list[ChapterInfo] = []

    # If there's content before the first chapter, create a "Preface" chapter
    if chapter_positions[0][0] > 0:
        preface_lines = lines[:chapter_positions[0][0]]
        preface_text = "\n".join(preface_lines).strip()
        if preface_text:
            chapters.append(ChapterInfo(
                title="前言",
                start=0,
                end=chapter_positions[0][0],
            ))

    for idx, (line_idx, title) in enumerate(chapter_positions):
        if idx + 1 < len(chapter_positions):
            end = chapter_positions[idx + 1][0]
        else:
            end = len(lines)
        chapters.append(ChapterInfo(title=title, start=line_idx, end=end))

    return chapters


def split_by_chapters(
    text: str,
    chapters: list[ChapterInfo],
    max_chunk_size: int = 50000,
) -> list[dict]:
    """Split text into chapter-based chunks.

    If a chapter exceeds max_chunk_size characters, it is further subdivided.
    If no chapters are detected, falls back to fixed-size splitting.

    Args:
        text: Full text content.
        chapters: Chapter boundaries from detect_chapters.
        max_chunk_size: Maximum characters per chunk.

    Returns:
        List of dicts with 'title' and 'content' keys.
    """
    lines = text.splitlines()

    if not chapters:
        return _split_text_fixed(text, max_chunk_size)

    result = []
    for ch in chapters:
        content = "\n".join(lines[ch.start:ch.end]).strip()
        if len(content) <= max_chunk_size:
            result.append({"title": ch.title, "content": content})
        else:
            # Split oversized chapter into sub-chunks
            sub_chunks = _split_text_fixed(content, max_chunk_size)
            for i, sc in enumerate(sub_chunks):
                suffix = f" ({i + 1})" if len(sub_chunks) > 1 else ""
                result.append({
                    "title": f"{ch.title}{suffix}",
                    "content": sc["content"],
                })

    return result


def _split_text_fixed(text: str, chunk_size: int) -> list[dict]:
    """Split text into fixed-size chunks, trying to break at paragraph boundaries."""
    if not text:
        return []

    chunks = []
    remaining = text
    chunk_idx = 1

    while remaining:
        if len(remaining) <= chunk_size:
            chunks.append({"title": f"第{chunk_idx}部分", "content": remaining.strip()})
            break

        # Try to find a paragraph break near the chunk boundary
        cut_pos = chunk_size
        newline_pos = remaining.rfind("\n\n", 0, chunk_size)
        if newline_pos > chunk_size * 0.5:
            cut_pos = newline_pos + 2
        else:
            newline_pos = remaining.rfind("\n", 0, chunk_size)
            if newline_pos > chunk_size * 0.5:
                cut_pos = newline_pos + 1

        chunks.append({"title": f"第{chunk_idx}部分", "content": remaining[:cut_pos].strip()})
        remaining = remaining[cut_pos:]
        chunk_idx += 1

    return chunks
