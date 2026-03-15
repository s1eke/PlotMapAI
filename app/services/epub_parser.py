"""EPUB file parser.

Extracts metadata, cover image, chapters (with TOC), and content from EPUB files.
Uses ebooklib for EPUB parsing and BeautifulSoup-like HTML stripping.
"""
import hashlib
import re
from html.parser import HTMLParser
from io import StringIO
from pathlib import Path

import ebooklib
from ebooklib import epub


class _HTMLTextExtractor(HTMLParser):
    """Strips HTML tags and extracts plain text."""

    def __init__(self):
        super().__init__()
        self._text = StringIO()
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True
        elif tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"):
            self._text.write("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False
        elif tag in ("p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._text.write("\n")

    def handle_data(self, data):
        if not self._skip:
            self._text.write(data)

    def get_text(self) -> str:
        return self._text.getvalue()


def _html_to_text(html_content: str) -> str:
    """Convert HTML to plain text."""
    extractor = _HTMLTextExtractor()
    extractor.feed(html_content)
    text = extractor.get_text()
    # Normalize multiple newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_epub(file_path: str, save_cover_dir: str = "") -> dict:
    """Parse an EPUB file and extract metadata, cover, and chapters.

    Args:
        file_path: Path to the EPUB file.
        save_cover_dir: Directory to save the extracted cover image.

    Returns:
        Dict with keys: title, author, description, cover_path, chapters,
                        total_words, file_hash, tags.
    """
    book = epub.read_epub(file_path, options={"ignore_ncx": True})

    # --- Metadata ---
    title = _get_metadata(book, "title") or Path(file_path).stem
    author = _get_metadata(book, "creator") or ""
    description = _get_metadata(book, "description") or ""
    language = _get_metadata(book, "language") or ""
    tags = []
    subjects = book.get_metadata("DC", "subject")
    if subjects:
        tags = [s[0] for s in subjects if s[0]]

    # --- Cover ---
    cover_path = ""
    if save_cover_dir:
        cover_path = _extract_cover(book, save_cover_dir, Path(file_path).stem)

    # --- Chapters ---
    chapters = _extract_chapters(book)

    # --- File hash ---
    with open(file_path, "rb") as f:
        file_hash = hashlib.sha256(f.read()).hexdigest()

    total_words = sum(len(ch["content"]) for ch in chapters)

    return {
        "title": title,
        "author": author,
        "description": _html_to_text(description) if "<" in description else description,
        "cover_path": cover_path,
        "chapters": chapters,
        "total_words": total_words,
        "file_hash": file_hash,
        "tags": tags,
    }


def _get_metadata(book: epub.EpubBook, field: str) -> str:
    """Safely get a DC metadata field."""
    data = book.get_metadata("DC", field)
    if data and data[0] and data[0][0]:
        return str(data[0][0])
    return ""


def _extract_cover(book: epub.EpubBook, save_dir: str, stem: str) -> str:
    """Extract cover image from EPUB and save to disk."""
    cover_item = None

    # Try to find cover via metadata
    cover_meta = book.get_metadata("OPF", "cover")
    if cover_meta:
        cover_id = cover_meta[0][1].get("content", "")
        if cover_id:
            for item in book.get_items():
                if item.get_id() == cover_id:
                    cover_item = item
                    break

    # Fallback: look for items with "cover" in name/id
    if not cover_item:
        for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
            name = (item.get_name() or "").lower()
            item_id = (item.get_id() or "").lower()
            if "cover" in name or "cover" in item_id:
                cover_item = item
                break

    # Fallback: just get the first image
    if not cover_item:
        images = list(book.get_items_of_type(ebooklib.ITEM_IMAGE))
        if images:
            cover_item = images[0]

    if not cover_item:
        return ""

    # Save the cover
    ext = Path(cover_item.get_name()).suffix or ".jpg"
    cover_filename = f"{stem}_cover{ext}"
    cover_path = Path(save_dir) / cover_filename
    cover_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cover_path, "wb") as f:
        f.write(cover_item.get_content())

    return str(cover_path)


def _extract_chapters(book: epub.EpubBook) -> list[dict]:
    """Extract chapters from EPUB spine/TOC."""
    chapters = []
    toc_titles = _build_toc_map(book)

    chapter_idx = 0
    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        content_bytes = item.get_content()
        if not content_bytes:
            continue

        try:
            html = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            html = content_bytes.decode("utf-8", errors="replace")

        text = _html_to_text(html)
        if not text.strip():
            continue

        # Try to get title from TOC map
        item_name = item.get_name()
        title = toc_titles.get(item_name, "")

        # Fallback: extract from <title> or <h1>
        if not title:
            title = _extract_title_from_html(html)

        if not title:
            title = f"Chapter {chapter_idx + 1}"

        chapters.append({
            "title": title,
            "content": text,
        })
        chapter_idx += 1

    return chapters


def _build_toc_map(book: epub.EpubBook) -> dict[str, str]:
    """Build a mapping from item href to TOC title."""
    toc_map = {}

    def _process_toc(toc_items):
        for item in toc_items:
            if isinstance(item, epub.Link):
                href = item.href.split("#")[0] if item.href else ""
                if href and item.title:
                    toc_map[href] = item.title
            elif isinstance(item, tuple) and len(item) == 2:
                section, children = item
                if hasattr(section, "href") and section.href:
                    href = section.href.split("#")[0]
                    if section.title:
                        toc_map[href] = section.title
                _process_toc(children)

    _process_toc(book.toc)
    return toc_map


def _extract_title_from_html(html: str) -> str:
    """Try to extract a title from HTML <title> or <h1> tags."""
    # Try <title>
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if match and match.group(1).strip():
        return _html_to_text(match.group(1)).strip()

    # Try <h1>
    match = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.IGNORECASE | re.DOTALL)
    if match and match.group(1).strip():
        return _html_to_text(match.group(1)).strip()

    return ""
