from __future__ import annotations
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

Base = declarative_base()

def _pick_db_url() -> str:
    env = (os.getenv("ENV") or "local").lower().strip()
    if env in ("prod", "production"):
        url = (os.getenv("SUPABASE_DB_URL") or "").strip()
        if not url:
            raise RuntimeError("SUPABASE_DB_URL is empty in production ENV")
        return url
    url = (os.getenv("DB_URL") or "").strip()
    if not url:
        url = "sqlite:///~/ai-fitness/data/server.db".replace("~", os.path.expanduser("~"))
    return url


DB_URL = _pick_db_url()

connect_args = {}
if DB_URL.startswith("postgresql+psycopg2://"):
    connect_args = {"sslmode": "require"}

engine = create_engine(
    DB_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 디버깅용
print("ENV =", os.getenv("ENV"))
print("DB_URL (effective) =", engine.url)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
