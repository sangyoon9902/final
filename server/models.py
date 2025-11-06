# server/models.py
from __future__ import annotations
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON

from db import Base

# ───────────────────────────────────
# SQLAlchemy ORM Models (DB 스키마만)
# ───────────────────────────────────

class DBUser(Base):
    """users 테이블: 고유 userId + 이름"""
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)   # uuid4
    name = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    results = relationship(
        "DBResult",
        back_populates="user",
        cascade="all, delete-orphan",
    )

class DBResult(Base):
    """results 테이블: 세션(trace_id) 단위 결과 스냅샷"""
    __tablename__ = "results"

    id = Column(String, primary_key=True, index=True)      # uuid4
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)

    trace_id = Column(String, index=True, unique=True)     # 세션 식별자
    status = Column(String, default="final")               # 기본 final (session_summary에서 저장)

    user_json = Column(SQLITE_JSON)                        # 요청 시점의 사용자 스냅샷
    surveys_json = Column(SQLITE_JSON)
    measurements_json = Column(SQLITE_JSON)
    plan_md = Column(Text)                                 # 생성된 처방 (Markdown)
    evidence_json = Column(SQLITE_JSON)                    # [{"type":"CSV","id":...}, ...]
    payload_json = Column(SQLITE_JSON)                     # 디버그/원자료(LLM I/O 등)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("DBUser", back_populates="results")

__all__ = ["DBUser", "DBResult"]
