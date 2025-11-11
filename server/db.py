# server/db.py
from __future__ import annotations
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ───────────────────── 환경/경로 결정 ─────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

def _mk_sqlite_url(db_path: Path) -> str:
    # 절대경로용 sqlite URL (슬래시 4개)
    return f"sqlite:////{db_path}" if db_path.is_absolute() else f"sqlite:///{db_path}"

def _decide_database_url() -> str:
    """무료 플랜 시연용: /tmp/server.db (휘발성, 권한 문제 없음)"""
    db_path = Path("/tmp/server.db")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return _mk_sqlite_url(db_path)

DATABASE_URL = _decide_database_url()

# ───────────────────── SQLAlchemy 엔진/세션 ─────────────────────
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ───────────────────── DI용 세션 제공자 ─────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
