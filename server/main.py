# server/main.py
from __future__ import annotations

from uuid import uuid4
from typing import Any, Dict, Optional
import json, traceback

from fastapi import FastAPI, Request, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

# 내부 모듈
from db import Base, engine, get_db
from models import DBUser, DBResult
from routers import users, review  # 기존 review 라우터 사용
from rag.query_engine_kspo_only import generate_prescription_kspo_only, _get_openai_client





app = FastAPI(title="AI Fitness API", version="0.3.1")

# server/main.py (맨 위 import들 아래 어딘가)
from urllib.parse import urlparse
from db import DATABASE_URL

# CORS
PROD = "https://final-theta-peach-92.vercel.app"
MAIN_PREVIEW = "https://final-git-main-sangyoon9902s-projects.vercel.app"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[PROD, MAIN_PREVIEW, "http://localhost:5173", "http://localhost:3000"],
    allow_origin_regex=r"^https://final[-a-z0-9]*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB 테이블 자동 생성 (초기 단계)
Base.metadata.create_all(bind=engine)






# ---- 공통 디버그: RDB 버전/URL 확인 ----
@app.get("/_debug/dbinfo")
def dbinfo():
    info = {"url": str(engine.url)}
    try:
        dialect = engine.url.get_backend_name()  # 'sqlite' | 'postgresql' ...
        with engine.connect() as conn:
            if dialect == "sqlite":
                info["version"] = conn.execute(text("select sqlite_version()")).scalar()
            else:
                info["version"] = conn.execute(text("select version()")).scalar()
            # results 테이블 카운트 (없으면 None)
            try:
                info["results_count"] = conn.execute(text("select count(*) from results")).scalar()
            except Exception:
                info["results_count"] = None
    except Exception as e:
        info["error"] = repr(e)
    return info

# 이벤트 핸들러
@app.on_event("startup")
def _startup_rag():
    try:
        _ = _get_openai_client()
        print("✅ OpenAI 클라이언트 로드 완료 (KSPO 전용)")
    except Exception as e:
        print("⚠️ OpenAI 초기화 실패:", e)

# Health / Root
@app.get("/health")
def health():
    return {"ok": True, "service": "ai-fitness", "version": app.version}

@app.get("/")
def root():
    return {
        "hello": "AI Fitness API",
        "health": "/health",
        "post_endpoint": "/session_summary",
        "version": app.version,
    }

# GET 안내
@app.get("/session_summary")
def session_summary_get():
    return {
        "detail": "Use POST with JSON body to /session_summary",
        "example": {
            "user": {"name": "문채희", "sex": "F", "age": 25, "height_cm": 160, "weight_kg": 55, "bmi": 21.5},
            "measurements": {"situp_reps": 20, "reach_cm": 5.0, "step_vo2max": None},
            "surveys": {},
        },
    }

# POST 본체
@app.post("/session_summary")
async def session_summary(req: Request, db: Session = Depends(get_db)):
    trace_id = str(uuid4())

    # 1) JSON 파싱
    try:
        body: Dict[str, Any] = await req.json()
    except Exception as e:
        print(f"❌ [session_summary] JSON parse error ({trace_id}): {e}")
        return JSONResponse(status_code=400, content={"trace_id": trace_id, "error": "invalid_json", "detail": str(e)})

    print(f"\n🌐 [session_summary] 요청 수신: {trace_id}")
    try:
        print(json.dumps(body, ensure_ascii=False, indent=2))
    except Exception:
        print(str(body))

    # 2) 처방 생성
    try:
        plan = generate_prescription_kspo_only(body, per_cat=3)
    except Exception as e:
        print(f"⚠️ RAG 생성 오류({trace_id}): {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"RAG error: {e}")

    # 3) 응답 정규화
    plan_md = (
        plan.get("planText", {}).get("planText")
        or plan.get("planText")
        or plan.get("plan_md")
        or ""
    )
    evidence = plan.get("evidence") or []
    received = body or {}

    # 4) DB 저장 (ORM, RDB 공통)
    try:
        user_obj = received.get("user", {})
        user_id = user_obj.get("userId")
        if not user_id:
            tmp_user = DBUser(id=str(uuid4()), name=user_obj.get("name", "미등록"))
            db.add(tmp_user)
            db.commit()
            db.refresh(tmp_user)
            user_id = tmp_user.id
            print(f"⚠️ userId 누락 → 임시 유저 생성: {user_id}")

        result = DBResult(
            id=str(uuid4()),
            user_id=user_id,
            trace_id=trace_id,
            status=( (received.get("status") or "").strip().lower()
                     if (received.get("status") or "").strip().lower() in {"ready","review","final"}
                     else "ready"),
            user_json=received.get("user"),
            surveys_json=received.get("surveys"),
            measurements_json=received.get("measurements"),
            plan_md=plan_md,
            evidence_json=evidence,
            payload_json={"source": "KSPO_only", "raw_plan": plan},
        )
        db.add(result)
        db.commit()
        print(f"💾 [DB 저장 완료] result_id={result.id}, user_id={user_id}")
    except Exception as e:
        print(f"⚠️ DB 저장 실패({trace_id}): {e}")
        traceback.print_exc()

    # 5) 응답
    return {"trace_id": trace_id, "planText": {"planText": plan_md}, "evidence": evidence, "received": received}

# 라우터 등록 (JSON API는 routers/review 로 몰아넣기 권장)
app.include_router(users.router)
app.include_router(review.router)
