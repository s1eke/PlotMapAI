"""Reader API routes: chapters list, chapter content (with purification), reading progress."""
from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session

from config import Config
from database import db_session
from models import Novel, Chapter, ReadingProgress, PurificationRule
from services.purifier import purify

reader_bp = Blueprint("reader", __name__)


@reader_bp.route("/novels/<int:novel_id>/chapters", methods=["GET"])
def list_chapters(novel_id: int):
    """Get chapter list (table of contents) for a novel."""
    session: Session = db_session()
    try:
        novel = session.query(Novel).filter_by(
            id=novel_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not novel:
            return jsonify({"error": "Novel not found"}), 404

        chapters = (
            session.query(Chapter)
            .filter_by(novel_id=novel_id)
            .order_by(Chapter.chapter_index)
            .all()
        )

        # Get enabled purification rules
        active_rules = (
            session.query(PurificationRule)
            .filter_by(user_id=Config.DEFAULT_USER_ID, is_enabled=True)
            .order_by(PurificationRule.order.asc())
            .all()
        )

        result = []
        for ch in chapters:
            title = purify(ch.title, active_rules, scope="title", book_title=novel.title)

            result.append({
                "index": ch.chapter_index,
                "title": title,
                "wordCount": ch.word_count,
            })

        return jsonify(result)
    finally:
        session.close()


@reader_bp.route("/novels/<int:novel_id>/chapters/<int:chapter_index>", methods=["GET"])
def get_chapter(novel_id: int, chapter_index: int):
    """Get a single chapter's content, purified by active rules."""
    session: Session = db_session()
    try:
        novel = session.query(Novel).filter_by(
            id=novel_id, user_id=Config.DEFAULT_USER_ID
        ).first()
        if not novel:
            return jsonify({"error": "Novel not found"}), 404

        chapter = (
            session.query(Chapter)
            .filter_by(novel_id=novel_id, chapter_index=chapter_index)
            .first()
        )
        if not chapter:
            return jsonify({"error": "Chapter not found"}), 404

        # Get enabled purification rules
        active_rules = (
            session.query(PurificationRule)
            .filter_by(user_id=Config.DEFAULT_USER_ID, is_enabled=True)
            .order_by(PurificationRule.order.asc())
            .all()
        )

        title = purify(chapter.title, active_rules, scope="title", book_title=novel.title)
        content = purify(chapter.content, active_rules, scope="content", book_title=novel.title)

        # Get total chapter count for navigation
        total_chapters = (
            session.query(Chapter)
            .filter_by(novel_id=novel_id)
            .count()
        )

        return jsonify({
            "index": chapter.chapter_index,
            "title": title,
            "content": content,
            "wordCount": len(content),
            "totalChapters": total_chapters,
            "hasPrev": chapter.chapter_index > 0,
            "hasNext": chapter.chapter_index < total_chapters - 1,
        })
    finally:
        session.close()


@reader_bp.route("/novels/<int:novel_id>/reading-progress", methods=["GET"])
def get_progress(novel_id: int):
    """Get reading progress for a novel."""
    session: Session = db_session()
    try:
        progress = (
            session.query(ReadingProgress)
            .filter_by(novel_id=novel_id, user_id=Config.DEFAULT_USER_ID)
            .first()
        )
        if not progress:
            return jsonify({
                "chapterIndex": 0,
                "scrollPosition": 0,
                "viewMode": "summary",
            })

        return jsonify({
            "chapterIndex": progress.chapter_index,
            "scrollPosition": progress.scroll_position,
            "viewMode": progress.view_mode,
        })
    finally:
        session.close()


@reader_bp.route("/novels/<int:novel_id>/reading-progress", methods=["PUT"])
def save_progress(novel_id: int):
    """Save reading progress for a novel."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    session: Session = db_session()
    try:
        progress = (
            session.query(ReadingProgress)
            .filter_by(novel_id=novel_id, user_id=Config.DEFAULT_USER_ID)
            .first()
        )

        if not progress:
            progress = ReadingProgress(
                user_id=Config.DEFAULT_USER_ID,
                novel_id=novel_id,
            )
            session.add(progress)

        if "chapterIndex" in data:
            progress.chapter_index = data["chapterIndex"]
        if "scrollPosition" in data:
            progress.scroll_position = data["scrollPosition"]
        if "viewMode" in data:
            progress.view_mode = data["viewMode"]

        session.commit()
        return jsonify({"message": "Progress saved"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()
