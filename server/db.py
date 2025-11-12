# server/db.py
from __future__ import annotations
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

load_dotenv()  # server/.env 자동 로드

BASE_DIR = Path(__file__).resolve().parent.parent  # <프로젝트 루트>
Base = declarative_base()


def _sqlite_url() -> str:
    """로컬 개발 폴백: <프로젝트>/data/server.db"""
    db_path = os.getenv("SERVER_DB_PATH") or str(BASE_DIR / "data" / "server.db")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    # 절대경로 sqlite는 //// 규칙
    return "sqlite:////" + os.path.abspath(db_path)


def _decide_database_url() -> str:
    """
    우선순위:
      1) DATABASE_URL_POOLED (Supabase pgbouncer: 6543 포트)
      2) DATABASE_URL (5432)
      3) sqlite 폴백
    또한 postgres 스킴이면 sslmode=require 자동 부여
    """
    url = (os.getenv("DATABASE_URL_POOLED") or os.getenv("DATABASE_URL") or "").strip()
    if url:
        # 비밀번호에 ^, @ 등 특문이 있으면 URL-인코딩(%..) 필요
        # 예: ^^ -> %5E%5E
        if url.startswith("postgresql") and "sslmode=" not in url:
            url += ("&" if "?" in url else "?") + "sslmode=require"
        return url
    return _sqlite_url()


DATABASE_URL = _decide_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

# 엔진 생성
if IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )
else:
    # 서버리스(Vercel 등)에서 안전: 요청마다 커넥션 생성/종료
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
