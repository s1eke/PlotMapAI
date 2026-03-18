import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flask import Flask
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

from models import Base, Novel, NovelRawContent, User
from routes.novels import novels_bp


class NovelDeletionTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self.temp_dir.name) / "novels-test.db"
        self.engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = scoped_session(sessionmaker(bind=self.engine))

        session = self.SessionLocal()
        session.add(User(id=1, username="default", display_name="默认用户"))
        session.commit()
        session.close()

        self.app = Flask(__name__)
        self.app.register_blueprint(novels_bp, url_prefix="/api")

    def tearDown(self):
        self.SessionLocal.remove()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _create_epub_novel(self, title: str, cover_path: Path, epub_path: Path) -> int:
        session = self.SessionLocal()
        novel = Novel(
            user_id=1,
            title=title,
            author="测试作者",
            description="",
            file_type="epub",
            file_hash=f"hash-{title}",
            cover_path=str(cover_path),
            original_filename=f"{title}.epub",
            original_encoding="utf-8",
            total_words=1000,
        )
        session.add(novel)
        session.flush()
        session.add(NovelRawContent(novel_id=novel.id, epub_path=str(epub_path)))
        session.commit()
        novel_id = novel.id
        session.close()
        return novel_id

    def test_delete_novel_keeps_shared_cover_and_epub_files(self):
        cover_path = Path(self.temp_dir.name) / "shared-cover.jpg"
        epub_path = Path(self.temp_dir.name) / "shared-book.epub"
        cover_path.write_bytes(b"cover")
        epub_path.write_bytes(b"epub")

        first_id = self._create_epub_novel("第一本", cover_path, epub_path)
        second_id = self._create_epub_novel("第二本", cover_path, epub_path)

        with patch("routes.novels.db_session", self.SessionLocal):
            response = self.app.test_client().delete(f"/api/novels/{first_id}")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(cover_path.exists())
        self.assertTrue(epub_path.exists())

        session = self.SessionLocal()
        self.assertIsNone(session.get(Novel, first_id))
        self.assertIsNotNone(session.get(Novel, second_id))
        session.close()

    def test_delete_novel_removes_files_when_last_reference_is_deleted(self):
        cover_path = Path(self.temp_dir.name) / "unique-cover.jpg"
        epub_path = Path(self.temp_dir.name) / "unique-book.epub"
        cover_path.write_bytes(b"cover")
        epub_path.write_bytes(b"epub")

        novel_id = self._create_epub_novel("唯一一本", cover_path, epub_path)

        with patch("routes.novels.db_session", self.SessionLocal):
            response = self.app.test_client().delete(f"/api/novels/{novel_id}")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(cover_path.exists())
        self.assertFalse(epub_path.exists())


if __name__ == "__main__":
    unittest.main()
