# server/db.py
from __future__ import annotations
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = Path(__file__).resolve().parent.parent  # <프로젝트 루트> = server/의 부모

def _mk_sqlite_url(db_path: Path) -> str:
    return f"sqlite:////{db_path}" if db_path.is_absolute() else f"sqlite:///{db_path}"

    
def _decide_database_url() -> str:
    env_path = os.getenv("SERVER_DB_PATH")
    if env_path:
        db_path = Path(env_path)
    else:
        # 로컬 기본: <프로젝트>/data/server.db, 운영(환경변수로 강제)일 땐 그 경로
        db_path = BASE_DIR / "data" / "server.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return _mk_sqlite_url(db_path)

DATABASE_URL = _decide_database_url()

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
