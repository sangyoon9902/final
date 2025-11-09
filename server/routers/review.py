# server/routers/review.py
from __future__ import annotations
from typing import Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, cast, String

from db import get_db
from models import DBResult  # DBUser는 여기선 불필요

router = APIRouter(prefix="/api", tags=["review"])

def _row_to_dict(r: DBResult) -> Dict[str, Any]:
    # 모델 필드명은 프로젝트 모델에 맞춰 조정
    return {
        "id": r.id,
        "user_id": r.user_id,
        "trace_id": r.trace_id,
        "status": r.status,
        "user": r.user_json,
        "surveys": r.surveys_json,
        "measurements": r.measurements_json,
        "planMd": r.plan_md,
        "evidence": r.evidence_json,
        "created_at": getattr(r, "created_at", None),
        "updated_at": getattr(r, "updated_at", None),
    }

@router.get("/results")
def list_results(
    page: int = 1,
    size: int = 50,
    q: str = "",
    userId: Optional[str] = None,   # ✅ /my에서 사용하는 필터
    db: Session = Depends(get_db),
):
    if page < 1: page = 1
    size = max(1, min(size, 200))

    query = db.query(DBResult)

    # 1) userId 정밀 필터 (정확 매칭)
    if userId:
        query = query.filter(DBResult.user_id == userId)

    # 2) 일반 검색(q) — 부분 문자열 검색(폴백용)
    if q:
        like = f"%{q}%"
        # JSON 컬럼·텍스트 컬럼을 일괄 LIKE (DB 엔진에 따라 cast 필요)
        query = query.filter(
            or_(
                DBResult.id.ilike(like),
                DBResult.trace_id.ilike(like),
                DBResult.user_id.ilike(like),
                cast(DBResult.plan_md, String).ilike(like),
                cast(DBResult.user_json, String).ilike(like),
                cast(DBResult.surveys_json, String).ilike(like),
                cast(DBResult.measurements_json, String).ilike(like),
            )
        )

    total = query.count()

    # 최신순 정렬(생성일 컬럼명에 맞춰 조정)
    if hasattr(DBResult, "created_at"):
        query = query.order_by(desc(DBResult.created_at))
    else:
        # 타임스탬프가 없다면 id/trace_id 정렬 등으로 대체
        query = query.order_by(desc(DBResult.id))

    rows = query.offset((page - 1) * size).limit(size).all()
    items = [_row_to_dict(r) for r in rows]
    return {"page": page, "size": size, "total": total, "items": items}

@router.get("/results/{id_or_trace}")
def get_result(id_or_trace: str, db: Session = Depends(get_db)):
    r = (
        db.query(DBResult)
        .filter(or_(DBResult.id == id_or_trace, DBResult.trace_id == id_or_trace))
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="result not found")
    return _row_to_dict(r)
