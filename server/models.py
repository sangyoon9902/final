# server/models.py
from __future__ import annotations
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, func, JSON, Index
from sqlalchemy.orm import relationship
from db import Base

# ───────────── 사용자 테이블 ─────────────
class DBUser(Base):
    """users 테이블: 고유 userId + 이름"""
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)  # uuid4
    name = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    results = relationship(
        "DBResult",
        back_populates="user",
        cascade="all, delete-orphan",
    )

# ───────────── 결과 테이블 ─────────────
class DBResult(Base):
    """results 테이블: 세션(trace_id) 단위 결과 스냅샷"""
    __tablename__ = "results"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)

    trace_id = Column(String, index=True, unique=True)
    status = Column(String, default="ready")

    user_json = Column(JSON)
    surveys_json = Column(JSON)
    measurements_json = Column(JSON)
    plan_md = Column(Text)
    evidence_json = Column(JSON)
    payload_json = Column(JSON)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("DBUser", back_populates="results")

    __table_args__ = (
        Index("ix_results_user_created", "user_id", "created_at"),
    )
