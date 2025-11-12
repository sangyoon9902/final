# server/routers/review.py
from __future__ import annotations
from typing import Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Body   # 👈 Body 추가!
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, cast, String

from db import get_db
from models import DBResult  # DBUser는 여기선 불필요

router = APIRouter(prefix="/api", tags=["review"])

def _row_to_dict(r: DBResult) -> Dict[str, Any]:
    u = r.user_json or {}
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
        "name": u.get("name"),
        "sex": u.get("sex"),
        "age": u.get("age"),
    }

@router.get("/results")
def list_results(
    page: int = 1,
    size: int = 50,
    q: str = "",
    userId: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if page < 1: page = 1
    size = max(1, min(size, 200))

    query = db.query(DBResult)

    if userId:
        query = query.filter(DBResult.user_id == userId)

    if q:
        like = f"%{q}%"
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

    total = query.order_by(None).count()
    if hasattr(DBResult, "created_at"):
        query = query.order_by(desc(DBResult.created_at), desc(DBResult.id))
    else:
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

# ✅ 여기가 새로 추가되는 PATCH 핸들러입니다.
@router.patch("/results/{id_or_trace}")
def update_result(
    id_or_trace: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """
    Body 예:
    {
      "planMd": "수정된 마크다운",
      "status": "final"  # 허용: ready / review / final / complete
    }
    """
    plan_md = payload.get("planMd", None) or payload.get("plan_md", None)
    status  = payload.get("status", None)

    if plan_md is None and status is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

    r = (
        db.query(DBResult)
        .filter(or_(DBResult.id == id_or_trace, DBResult.trace_id == id_or_trace))
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="result not found")

    if plan_md is not None:
        r.plan_md = str(plan_md)

    if status is not None:
        allowed = {"ready", "review", "final", "complete"}  # 👈 complete도 허용
        s = str(status).strip().lower()
        if s not in allowed:
            raise HTTPException(status_code=400, detail=f"invalid status: {status}")
        # 프론트가 'complete'를 보내면 'final'로 정규화하고 싶다면 아래 한 줄로 매핑:
        # s = "final" if s == "complete" else s
        r.status = s

    db.add(r)
    db.commit()
    db.refresh(r)
    return {"ok": True, "id": r.id, "trace_id": r.trace_id, "status": r.status}
