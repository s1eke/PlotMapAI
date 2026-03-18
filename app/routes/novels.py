"""Novel management API routes: upload, list, detail, delete, cover."""
import os
import json
from pathlib import Path

from flask import Blueprint, request, jsonify, send_file
from sqlalchemy.orm import Session

from config import Config
from database import db_session
from models import Novel, NovelRawContent, Chapter, TocRule
from services.txt_parser import parse_txt
from services.epub_parser import parse_epub

novels_bp = Blueprint("novels", __name__)


@novels_bp.route("/novels", methods=["GET"])
def list_novels():
    """Get all novels for the default user (bookshelf)."""
    session: Session = db_session()
    try:
        novels = (
            session.query(Novel)
            .filter_by(user_id=Config.DEFAULT_USER_ID)
            .order_by(Novel.created_at.desc())
            .all()
        )
        return jsonify([_novel_to_dict(n) for n in novels])
    finally:
        session.close()


@novels_bp.route("/novels/upload", methods=["POST"])
def upload_novel():
    """Upload a TXT or EPUB file."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No filename"}), 400

    filename = file.filename
    ext = Path(filename).suffix.lower()

    if ext not in (".txt", ".epub"):
        return jsonify({"error": "Only .txt and .epub files are supported"}), 400

    raw_bytes = file.read()
    if not raw_bytes:
        return jsonify({"error": "File is empty"}), 400

    session: Session = db_session()
    try:
        if ext == ".txt":
            result = _handle_txt_upload(session, raw_bytes, filename)
        else:
            result = _handle_epub_upload(session, raw_bytes, filename)

        return jsonify(result), 201

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@novels_bp.route("/novels/<int:novel_id>", methods=["GET"])
def get_novel(novel_id: int):
    """Get novel detail (metadata)."""
    session: Session = db_session()
    try:
        novel = session.query(Novel).filter_by(
            id=novel_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not novel:
            return jsonify({"error": "Novel not found"}), 404

        data = _novel_to_dict(novel)
        data["chapter_count"] = len(novel.chapters)
        return jsonify(data)
    finally:
        session.close()


@novels_bp.route("/novels/<int:novel_id>", methods=["DELETE"])
def delete_novel(novel_id: int):
    """Delete a novel and all associated data."""
    session: Session = db_session()
    try:
        novel = session.query(Novel).filter_by(
            id=novel_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not novel:
            return jsonify({"error": "Novel not found"}), 404

        cover_path_to_delete, epub_path_to_delete = _plan_novel_file_cleanup(session, novel)

        session.delete(novel)
        session.commit()
        _remove_file_if_exists(cover_path_to_delete)
        _remove_file_if_exists(epub_path_to_delete)
        return jsonify({"message": "Novel deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@novels_bp.route("/novels/<int:novel_id>/cover", methods=["GET"])
def get_cover(novel_id: int):
    """Get novel cover image."""
    session: Session = db_session()
    try:
        novel = session.query(Novel).filter_by(
            id=novel_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not novel or not novel.cover_path:
            return jsonify({"error": "No cover available"}), 404

        if not os.path.exists(novel.cover_path):
            return jsonify({"error": "Cover file not found"}), 404

        return send_file(novel.cover_path)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _plan_novel_file_cleanup(session: Session, novel: Novel) -> tuple[str | None, str | None]:
    """Return the cover/EPUB paths that are safe to delete after the DB row is removed."""
    cover_path_to_delete = None
    epub_path_to_delete = None

    if novel.cover_path and not _has_other_cover_reference(session, novel.cover_path, novel.id):
        cover_path_to_delete = novel.cover_path

    epub_path = novel.raw_content.epub_path if novel.raw_content else ""
    if epub_path and not _has_other_epub_reference(session, epub_path, novel.id):
        epub_path_to_delete = epub_path

    return cover_path_to_delete, epub_path_to_delete


def _has_other_cover_reference(session: Session, cover_path: str, exclude_novel_id: int) -> bool:
    if not cover_path:
        return False
    return (
        session.query(Novel.id)
        .filter(Novel.cover_path == cover_path, Novel.id != exclude_novel_id)
        .first()
        is not None
    )


def _has_other_epub_reference(session: Session, epub_path: str, exclude_novel_id: int) -> bool:
    if not epub_path:
        return False
    return (
        session.query(NovelRawContent.novel_id)
        .filter(NovelRawContent.epub_path == epub_path, NovelRawContent.novel_id != exclude_novel_id)
        .first()
        is not None
    )


def _remove_file_if_exists(file_path: str | None) -> None:
    if file_path and os.path.exists(file_path):
        os.remove(file_path)


def _handle_txt_upload(session: Session, raw_bytes: bytes, filename: str) -> dict:
    """Process a TXT file upload."""
    # Get active TOC rules
    rules = (
        session.query(TocRule)
        .filter_by(user_id=Config.DEFAULT_USER_ID, enable=True)
        .order_by(TocRule.serial_number)
        .all()
    )
    rule_dicts = [{"rule": r.rule, "serial_number": r.serial_number} for r in rules]

    # Parse
    parsed = parse_txt(raw_bytes, filename, rule_dicts)

    # Create novel record
    novel = Novel(
        user_id=Config.DEFAULT_USER_ID,
        title=parsed["title"],
        author=parsed["author"],
        description=parsed["description"],
        file_type="txt",
        file_hash=parsed["file_hash"],
        original_filename=filename,
        original_encoding=parsed["encoding"],
        total_words=parsed["total_words"],
    )
    session.add(novel)
    session.flush()  # Get novel.id

    # Store raw content
    raw_content = NovelRawContent(
        novel_id=novel.id,
        raw_text=parsed["raw_text"],
    )
    session.add(raw_content)

    # Store chapters
    for idx, ch in enumerate(parsed["chapters"]):
        chapter = Chapter(
            novel_id=novel.id,
            title=ch["title"],
            content=ch["content"],
            chapter_index=idx,
            word_count=len(ch["content"]),
        )
        session.add(chapter)

    session.commit()
    return _novel_to_dict(novel)


def _handle_epub_upload(session: Session, raw_bytes: bytes, filename: str) -> dict:
    """Process an EPUB file upload."""
    # Save EPUB file to disk first (ebooklib needs a file path)
    epub_dir = os.path.join(Config.UPLOAD_DIR, "epubs")
    os.makedirs(epub_dir, exist_ok=True)

    import hashlib
    file_hash = hashlib.sha256(raw_bytes).hexdigest()
    epub_filename = f"{file_hash}_{filename}"
    epub_path = os.path.join(epub_dir, epub_filename)
    with open(epub_path, "wb") as f:
        f.write(raw_bytes)

    # Parse
    cover_dir = os.path.join(Config.UPLOAD_DIR, "covers")
    parsed = parse_epub(epub_path, save_cover_dir=cover_dir)

    # Create novel record
    novel = Novel(
        user_id=Config.DEFAULT_USER_ID,
        title=parsed["title"],
        author=parsed["author"],
        description=parsed["description"],
        tags=json.dumps(parsed.get("tags", []), ensure_ascii=False),
        file_type="epub",
        file_hash=parsed["file_hash"],
        cover_path=parsed.get("cover_path", ""),
        original_filename=filename,
        original_encoding="utf-8",
        total_words=parsed["total_words"],
    )
    session.add(novel)
    session.flush()

    # Store raw content reference
    raw_content = NovelRawContent(
        novel_id=novel.id,
        epub_path=epub_path,
    )
    session.add(raw_content)

    # Store chapters
    for idx, ch in enumerate(parsed["chapters"]):
        chapter = Chapter(
            novel_id=novel.id,
            title=ch["title"],
            content=ch["content"],
            chapter_index=idx,
            word_count=len(ch["content"]),
        )
        session.add(chapter)

    session.commit()
    return _novel_to_dict(novel)


def _novel_to_dict(novel: Novel) -> dict:
    """Convert Novel model to API response dict."""
    tags = []
    if novel.tags:
        try:
            tags = json.loads(novel.tags)
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        "id": novel.id,
        "title": novel.title,
        "author": novel.author,
        "description": novel.description,
        "tags": tags,
        "fileType": novel.file_type,
        "hasCover": bool(novel.cover_path),
        "originalFilename": novel.original_filename,
        "originalEncoding": novel.original_encoding,
        "totalWords": novel.total_words,
        "createdAt": novel.created_at.isoformat() if novel.created_at else None,
    }
