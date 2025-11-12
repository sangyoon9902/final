# server/main.py
from __future__ import annotations

from uuid import uuid4
from typing import Any, Dict
import json, traceback, socket, os    # ← os 추가
from contextlib import closing
from pathlib import Path

import httpx                           # ← httpx 추가
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from dotenv import load_dotenv

# ───────────── 환경변수(.env) 로드: 반드시 db import보다 먼저 ─────────────
load_dotenv(Path(__file__).resolve().parent / ".env")

# ───────────── 내부 모듈 ─────────────
from db import Base, engine, get_db
from models import DBUser, DBResult
from routers import users, review
from rag.query_engine_kspo_only import generate_prescription_kspo_only, _get_openai_client

# ───────────── FastAPI 초기화 ─────────────
app = FastAPI(title="AI Fitness API", version="0.3.2")

# ───────────── CORS 설정 ─────────────
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

# ───────────── DB 테이블 생성 (SQLite일 때만 자동) ─────────────
try:
    dialect = engine.url.get_backend_name()
    if dialect == "sqlite":
        Base.metadata.create_all(bind=engine)
except Exception:
    traceback.print_exc()

# ───────────── 디버그 엔드포인트: DB 연결 상태 확인 ─────────────
@app.get("/_debug/dbinfo")
def dbinfo():
    info = {"url": str(engine.url)}
    try:
        dialect = engine.url.get_backend_name()
        with engine.connect() as conn:
            if dialect == "sqlite":
                info["version"] = conn.execute(text("select sqlite_version()")).scalar()
            else:
                info["version"] = conn.execute(text("select version()")).scalar()

            try:
                info["results_count"] = conn.execute(text("select count(*) from results")).scalar()
            except Exception:
                info["results_count"] = None
    except Exception as e:
        info["error"] = repr(e)

    host = engine.url.host
    port = engine.url.port
    if host:
        info["host"] = host
        if port:
            info["port"] = port
        try:
            infos = socket.getaddrinfo(host, None)
            resolved = sorted({addr[4][0] for addr in infos if addr and addr[4] and addr[4][0]})
            if resolved:
                info["resolved_ips"] = resolved
        except socket.gaierror as exc:
            info["dns_error"] = str(exc)
        if port:
            try:
                with closing(socket.create_connection((host, port), timeout=2)):
                    info["tcp_connectivity"] = "ok"
            except OSError as exc:
                info["tcp_error"] = str(exc)
    return info

# ───────────── 이벤트 핸들러: OpenAI 초기화 ─────────────
@app.on_event("startup")
def _startup_rag():
    try:
        _ = _get_openai_client()
        print("✅ OpenAI 클라이언트 로드 완료 (KSPO 전용)")
    except Exception as e:
        print("⚠️ OpenAI 초기화 실패:", e)

# ───────────── 기본/헬스 체크 ─────────────
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

# ─────────────────────────────────────────────────────────────
# 👉 Pulsoid Proxy START
# REST: https://dev.pulsoid.net/api/v1/data/heart_rate/latest  (Bearer 토큰 필요)
PULSOID_LATEST_URL = "https://pulsoid.net/api/v1/data/heart_rate/latest"

@app.get("/api/heart-rate/health")
def pulsoid_health():
    has = bool((os.getenv("PULSOID_TOKEN") or "").strip())
    return {"ok": has, "hasToken": has}

@app.get("/api/heart-rate")
async def proxy_heart_rate():
    token = (os.getenv("PULSOID_TOKEN") or "").strip()
    if not token:
        raise HTTPException(status_code=500, detail="PULSOID_TOKEN is not set")

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                PULSOID_LATEST_URL,
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code in (401, 403):
            raise HTTPException(status_code=r.status_code, detail="Pulsoid auth error")
        r.raise_for_status()
        j = r.json() or {}

        # 다양한 응답 포맷을 단일 키로 평탄화
        bpm = (
            (j.get("data") or {}).get("heart_rate")
            or j.get("heart_rate")
            or j.get("value")
            or j.get("bpm")
        )
        measured_at = j.get("measured_at") or j.get("timestamp")

        return {"bpm": bpm, "measured_at": measured_at, "_proxy": "fastapi"}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Pulsoid upstream timeout")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Pulsoid upstream error: {e}")
# 👈 Pulsoid Proxy END
# ─────────────────────────────────────────────────────────────

# ───────────── GET 안내 ─────────────
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

# ───────────── POST 본체 ─────────────
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

    # 4) DB 저장
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
            status=((received.get("status") or "").strip().lower()
                    if (received.get("status") or "").strip().lower() in {"ready", "review", "final"}
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
    return {
        "trace_id": trace_id,
        "planText": {"planText": plan_md},
        "evidence": evidence,
        "received": received,
    }

# ───────────── 라우터 등록 ─────────────
app.include_router(users.router)
app.include_router(review.router)
