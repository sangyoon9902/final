# server/db.py
from __future__ import annotations
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ───────────────────── 환경/경로 결정 ─────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# 1) Render에 Persistent Disk를 /var/data 로 마운트했다고 가정
#    (Render 대시보드에서 Disks 추가 → Mount path=/var/data)
RENDER_DISK_DIR = Path(os.getenv("RENDER_DISK_PATH", "/var/data"))

# 2) DB_URL이 있으면 **최우선** 사용 (예: sqlite:////var/data/server.db)
env_db_url = os.getenv("DB_URL", "").strip()

def _mk_sqlite_url(db_path: Path) -> str:
    # 절대경로용 sqlite URL (슬래시 4개)
    return f"sqlite:////{db_path}" if db_path.is_absolute() else f"sqlite:///{db_path}"

def _decide_database_url() -> str:
    if env_db_url:
        return env_db_url

    is_render = bool(os.getenv("RENDER")) or RENDER_DISK_DIR.exists()
    if is_render:
        # Render(배포) 환경: 퍼시스턴트 디스크에 저장
        db_path = RENDER_DISK_DIR / "server.db"
        # 마운트 경로는 이미 존재하지만, 혹시 몰라 시도 (권한 문제 없으면 OK)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return _mk_sqlite_url(db_path)

    # 로컬 개발: 레포 내부 data/server.db
    local_db_dir = BASE_DIR / "data"
    local_db_dir.mkdir(parents=True, exist_ok=True)
    return _mk_sqlite_url(local_db_dir / "server.db")

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
