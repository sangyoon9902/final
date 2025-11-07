# db_api.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Any, Dict, Optional
import sqlite3, os, json, logging

DB_PATH = os.getenv("SERVER_DB_PATH") or "/Users/sangyuni/ai-fitness/data/server.db"
PAGE_SIZE_MAX = 200

app = FastAPI(title="Results JSON API", docs_url=None, redoc_url=None)

# ----- CORS: 프론트 오리진 명시 -----
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,          # 쿠키 안 쓰면 False로 둬도 OK
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- 로깅 -----
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("db_api")

def connect():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def _loads(s: Optional[str]):
    try:
        return json.loads(s) if s else None
    except Exception:
        return None

def _get(row: sqlite3.Row | Dict[str, Any], key: str, default=None):
    # Row/Dict 모두 안전 접근
    try:
        if isinstance(row, dict):
            return row.get(key, default)
        if key in row.keys():
            return row[key]
        return default
    except Exception:
        return default

def _row_to_summary(r: sqlite3.Row):
    return {
        "id": str(_get(r, "id", "")),
        "trace_id": _get(r, "trace_id", ""),
        "name": _get(r, "name", None),
        "sex": _get(r, "sex", None),
        "age": _get(r, "age", None),
        "created_at": _get(r, "created_at", None),
        "status": _get(r, "status", None),
    }

def _row_to_full(r: sqlite3.Row | Dict[str, Any]):
    # 결과창(Results.jsx)과 호환되는 구조
    user         = _loads(_get(r, "user_json")) or {}
    surveys      = _loads(_get(r, "surveys_json")) or {}
    measurements = _loads(_get(r, "measurements_json")) or {}
    evidence     = _loads(_get(r, "evidence_json")) or []
    raw          = _loads(_get(r, "raw_json")) or {}
    plan_md      = _get(r, "plan_md", "") or ""

    return {
        "id": str(_get(r, "id", "")),
        "trace_id": _get(r, "trace_id", ""),
        "created_at": _get(r, "created_at", None),
        "status": _get(r, "status", None),
        # ▼ Results.jsx payload-like
        "user": user,
        "surveys": surveys,
        "measurements": measurements,
        # ▼ sendSessionSummary 호환
        "planMd": plan_md,
        "evidence": evidence,
        "raw": raw,
    }

@app.get("/")
def root():
    return {
        "ok": True,
        "message": "Results JSON API",
        "db_path": DB_PATH,
        "endpoints": ["/api/results?page=&size=&q=", "/api/results/{id_or_trace_id}", "/healthz"],
    }

@app.get("/healthz")
def healthz():
    # 간단한 쿼리로 DB 연결 확인
    try:
        conn = connect(); conn.execute("SELECT 1"); conn.close()
        return {"ok": True}
    except Exception as e:
        log.exception("healthz failed")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/api/results")
def list_results(page: int = 1, size: int = 50, q: str = ""):
    size = max(1, min(PAGE_SIZE_MAX, int(size)))
    off = (max(1, int(page)) - 1) * size
    like = f"%{q}%"

    conn = connect(); cur = conn.cursor()
    total = cur.execute("""
      SELECT COUNT(*) FROM results
      WHERE CAST(user_json AS TEXT) LIKE ?
         OR CAST(measurements_json AS TEXT) LIKE ?
         OR CAST(surveys_json AS TEXT) LIKE ?
    """, (like, like, like)).fetchone()[0]

    rows = cur.execute("""
      SELECT
        id, trace_id, status, created_at,
        json_extract(user_json,'$.name') AS name,
        json_extract(user_json,'$.sex')  AS sex,
        json_extract(user_json,'$.age')  AS age
      FROM results
      WHERE CAST(user_json AS TEXT) LIKE ?
         OR CAST(measurements_json AS TEXT) LIKE ?
         OR CAST(surveys_json AS TEXT) LIKE ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    """, (like, like, like, size, off)).fetchall()
    conn.close()

    return {
        "page": page,
        "size": size,
        "total": total,
        "items": [_row_to_summary(r) for r in rows],
    }

@app.get("/api/results/{key}")
def get_result(key: str):
    try:
        conn = connect(); cur = conn.cursor()
        # 1) id로 조회
        row = cur.execute("SELECT * FROM results WHERE CAST(id AS TEXT)=? LIMIT 1", (key,)).fetchone()
        # 2) trace_id로 조회
        if not row:
            row = cur.execute("SELECT * FROM results WHERE trace_id=? LIMIT 1", (key,)).fetchone()
        conn.close()

        if not row:
            raise HTTPException(404, detail="Not found")

        return _row_to_full(row)
    except HTTPException:
        raise
    except Exception as e:
        log.exception("get_result failed for key=%s", key)
        # 500이 떠도 CORS 헤더가 붙도록 JSONResponse 사용
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
from fastapi import Body

@app.patch("/api/results/{key}")
def update_result(key: str, payload: dict = Body(...)):
    """
    Body 예:
    {
      "planMd": "수정된 마크다운",
      "status": "review"   # (선택) draft/review/final 등
    }
    """
    plan_md = payload.get("planMd")
    status  = payload.get("status")  # optional

    if plan_md is None and status is None:
        raise HTTPException(400, "Nothing to update")

    conn = connect(); cur = conn.cursor()

    # 키 해석
    row = cur.execute("SELECT id FROM results WHERE CAST(id AS TEXT)=? LIMIT 1", (key,)).fetchone()
    if not row:
        row = cur.execute("SELECT id FROM results WHERE trace_id=? LIMIT 1", (key,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Not found")

    rid = row["id"]

    # 동적 업데이트
    sets = []
    params = []
    if plan_md is not None:
        sets.append("plan_md = ?")
        params.append(plan_md)
    if status is not None:
        sets.append("status = ?")
        params.append(status)
    params.append(rid)

    sql = f"UPDATE results SET {', '.join(sets)} WHERE id = ?"
    cur.execute(sql, params)
    conn.commit()
    updated = cur.rowcount
    conn.close()

    return {"ok": True, "updated": updated, "id": str(rid)}
