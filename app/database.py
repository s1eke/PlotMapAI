"""SQLAlchemy database engine, session management, and initialization."""
import json
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session

from config import Config
from models import Base, TocRule, PurificationRuleSet, PurificationRule, User

engine = create_engine(
    Config.DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in Config.DATABASE_URL else {},
)

SessionLocal = sessionmaker(bind=engine)
db_session = scoped_session(SessionLocal)

# Enable WAL mode for SQLite for better concurrent read performance
if "sqlite" in Config.DATABASE_URL:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def init_db():
    """Create all tables and seed default data."""
    # Ensure the data directory exists for SQLite
    if "sqlite" in Config.DATABASE_URL:
        db_path = Config.DATABASE_URL.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    Base.metadata.create_all(bind=engine)
    
    # Use a single session for all seeding
    with db_session() as session:
        _seed_default_user(session)
        _seed_default_toc_rules(session)
        _seed_default_purification_rules(session)


def _seed_default_user(session):
    """Create the default user if not exists."""
    if not session.query(User).filter_by(id=Config.DEFAULT_USER_ID).first():
        try:
            session.add(User(id=Config.DEFAULT_USER_ID, username="default", display_name="默认用户"))
            session.commit()
        except Exception as e:
            print(f"Error seeding default user: {e}")
            session.rollback()


def _seed_default_toc_rules(session):
    """Seed default TOC rules if not already present."""
    # Check if the table is empty
    if session.query(TocRule).count() > 0:
        return

    json_path = os.path.join(os.path.dirname(__file__), "resources", "default_toc_rules.json")
    if not os.path.exists(json_path):
        print(f"Warning: Default TOC rules file not found at {json_path}")
        return

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            rules = json.load(f)

        for i, rule_data in enumerate(rules):
            rule = TocRule(
                user_id=Config.DEFAULT_USER_ID,
                name=rule_data.get("name", f"Default Rule {i}"),
                rule=rule_data.get("rule", rule_data.get("pattern", "")),
                example=rule_data.get("example", ""),
                serial_number=rule_data.get("serialNumber", i + 1),
                enable=rule_data.get("enable", True),
                is_default=True
            )
            session.add(rule)
        session.commit()
    except Exception as e:
        print(f"Error seeding default TOC rules: {e}")
        session.rollback()


def _seed_default_purification_rules(session):
    """Seed sample/default purification rules if the table is empty."""
    if session.query(PurificationRule).count() > 0:
        return

    # Basic sample rules if no JSON file exists
    defaults = [
        {
            "name": "去除空白行",
            "group": "格式",
            "pattern": "^\\s*$",
            "replacement": "",
            "is_regex": True,
            "order": 1,
            "scope_title": False,
            "scope_content": True
        },
        {
            "name": "去除行首尾空格",
            "group": "格式",
            "pattern": "^\\s+|\\s+$",
            "replacement": "",
            "is_regex": True,
            "order": 2,
            "scope_title": True,
            "scope_content": True
        }
    ]

    try:
        for rd in defaults:
            rule = PurificationRule(
                user_id=Config.DEFAULT_USER_ID,
                name=rd["name"],
                group=rd["group"],
                pattern=rd["pattern"],
                replacement=rd["replacement"],
                is_regex=rd["is_regex"],
                is_enabled=True,
                order=rd["order"],
                scope_title=rd["scope_title"],
                scope_content=rd["scope_content"]
            )
            session.add(rule)
        session.commit()
    except Exception as e:
        print(f"Error seeding default purification rules: {e}")
        session.rollback()


def get_db():
    """Get a database session. Use in request context."""
    session = db_session()
    try:
        yield session
    finally:
        session.close()
