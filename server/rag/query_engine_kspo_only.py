# server/rag/query_engine_kspo_only.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path
import os, json, re

import httpx
from dotenv import load_dotenv
from openai import OpenAI

# 1) CSV kNN
from .query_engine_csv import retrieve_similar_structured
# 2) CSV 빈도 → KSPO 매칭/대표영상 선택(카테고리: 심폐지구력/근력·근지구력/유연성)
from .query_engine_kspo_videos import prescribe_from_freq_and_kspo

# ───────── .env 명시 로드 ─────────
SERVER_DIR = Path(__file__).resolve().parent.parent  # server/
ENV_PATH = SERVER_DIR / ".env"
load_dotenv(ENV_PATH)

# OPENAI_API_KEY 환경변수 보정(비어있으면 빈 문자열)
_k = (os.getenv("OPENAI_API_KEY") or "").strip()
os.environ["OPENAI_API_KEY"] = _k

# ───────── OpenAI 클라이언트: 지연 초기화(lazy init) ─────────
__openai_client: Optional[OpenAI] = None
def _get_openai_client() -> OpenAI:
    """
    - import 시점이 아니라 호출 시점에 초기화
    - proxies는 httpx.Client를 통해 설정 (OpenAI(...)에 proxies 인자 직접 전달 금지)
    """
    global __openai_client
    if __openai_client is not None:
        return __openai_client

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("OPENAI_BASE_URL") or "").strip() or None
    org_id   = (os.getenv("OPENAI_ORG_ID") or "").strip() or None

    proxy = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
    http_client = httpx.Client(proxies=proxy, timeout=30.0) if proxy else None

    __openai_client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        organization=org_id if org_id else None,
        http_client=http_client,
    )
    return __openai_client


VALID_CATS = ["심폐지구력", "근력/근지구력", "유연성"]

def _score_of(n: Dict[str, Any]) -> float:
    return float(n.get("combined_score") or n.get("raw_score") or n.get("score") or 0.0)

def _kspo_meta_path() -> str:
    return str(Path(__file__).resolve().parent / "embed_store" / "kspo_videos" / "kspo_meta.json")

def _acsm_meta_path() -> str:
    return str(Path(__file__).resolve().parent / "embed_store" / "acsm6" / "acsm6_meta.json")

# ✅ 정확 라벨 집합
AGE_BANDS = ["유아기", "유소년", "청소년", "성인", "어르신"]

# ✅ alias → 정확 라벨
_AGE_ALIASES = {
    "유아기": "유아기", "유아": "유아기",
    "유소년기": "유소년", "유소년": "유소년",
    "청소년기": "청소년", "청소년": "청소년",
    "성인기": "성인", "성인": "성인",
    "어르신기": "어르신", "어르신": "어르신", "노인": "어르신", "고령": "어르신",
}

def _norm_title(s: str) -> str:
    if not s: return ""
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\[[^\]]*\]", " ", s)
    s = re.sub(r"[·•\-:_/]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.lower()

def _canon_age_label(tok: str) -> Optional[str]:
    tok = (tok or "").strip()
    if tok in AGE_BANDS:
        return tok
    return _AGE_ALIASES.get(tok)

def _age_band_from_age(age: Optional[int]) -> str:
    try:
        a = int(age)
    except Exception:
        return "성인"
    if a <= 6:   return "유아기"
    if a <= 12:  return "유소년"
    if a <= 18:  return "청소년"
    if a <= 64:  return "성인"
    return "어르신"

def _band_distance(a: str, b: str) -> int:
    try:
        ia = AGE_BANDS.index(a); ib = AGE_BANDS.index(b)
        return abs(ia - ib)
    except ValueError:
        return 3

def _split_targets(s: str) -> List[str]:
    if not s: return []
    # 괄호 안 범위(예: 19~64세) 제거
    s = re.sub(r"\([^)]*\)", "", s)
    parts = re.split(r"[\/,\s|·]+", s.strip())
    out: List[str] = []
    for p in parts:
        canon = _canon_age_label(p)
        if canon and canon not in out:
            out.append(canon)
    return out

def _rerank_video_by_age_and_target(
    picked: Optional[Dict[str, Any]],
    *,
    title: str,
    category: str,
    user_age_band: str,
    meta_rows: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    norm_t = _norm_title(title)
    cands = [
        r for r in meta_rows
        if _norm_title(r.get("title") or "") == norm_t
        and (r.get("fitness_category") or "").strip() == (category or "").strip()
    ]
    if not cands:
        cands = [r for r in meta_rows if _norm_title(r.get("title") or "") == norm_t]
    if not cands:
        return picked

    def score(r: Dict[str, Any]) -> Tuple[int, int, int]:
        targets = _split_targets(r.get("target") or "")
        d = min((_band_distance(user_age_band, t) for t in targets), default=3)
        cat_penalty = 0 if (r.get("fitness_category") or "") == category else 2
        try:
            rank = int(r.get("rank_on_page") or 999)
        except Exception:
            rank = 999
        return (d, cat_penalty, rank)

    cands.sort(key=score)
    best = cands[0]
    if picked and best.get("youtube_id") != picked.get("youtube_id"):
        print(
            f"[KSPO-rerank] '{title}' ({category}) "
            f"user_band={user_age_band} -> {best.get('youtube_id')} "
            f"(target={best.get('target')}, rank={best.get('rank_on_page')})"
        )
    return best

# ───────── CSV 유사사례 텍스트에서 종목 토큰 수집 ─────────
def _extract_names_from_csv_neighbors(csv_neighbors: List[Dict[str, Any]]) -> Dict[str, int]:
    bag: Dict[str, int] = {}
    sep_re = re.compile(r"[;,/]| / |·|•|\n")
    clean_re = re.compile(r"\s+")
    for n in (csv_neighbors or []):
        text = f"{n.get('prescription_text') or ''} {n.get('prescription') or ''}"
        text = re.sub(r"(준비운동|본운동|정리운동)\s*:\s*", " ", text)
        parts = [p.strip() for p in sep_re.split(text) if p.strip()]
        for p in parts:
            if any(tok in p for tok in ["루틴프로그램","루틴 스트레칭","루틴","프로그램"]):
                continue
            p = re.sub(r"\d+\s*(세트|회|분|초|RM|%)", " ", p)
            p = re.sub(r"[()\[\]]", " ", p)
            p = clean_re.sub(" ", p).strip()
            if 1 <= len(p) <= 30:
                bag[p] = bag.get(p, 0) + 1
    return bag

# ───────── ACSM6 간단 후보 검색기 (설문 의존 제거) ─────────
def _load_acsm_meta() -> List[Dict[str, Any]]:
    p = _acsm_meta_path()
    if not os.path.exists(p):
        return []
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        return data.get("items", [])
    except Exception:
        return []

def _match_score(text: str, q_terms: List[str]) -> int:
    s = 0
    tl = text.lower()
    for t in q_terms:
        t = (t or "").lower().strip()
        if not t: continue
        if t in tl: s += 2
    return s

def _mk_terms(payload: Dict[str, Any]) -> List[str]:
    """설문 불사용: 사용자 프로필/측정치만으로 검색어 구성"""
    u = payload.get("user") or {}
    m = payload.get("measurements") or {}

    terms = [
        "유산소", "근력", "근지구력", "유연성",
        "빈도", "강도", "시간", "RPE", "HRR", "1RM", "정적 스트레칭",
    ]
    age = u.get("age")
    sex = (u.get("sex") or "").upper()
    if isinstance(age, (int, float)):
        if age >= 65: terms += ["고령자", "노인", "균형", "낙상 예방"]
        elif age <= 18: terms += ["청소년", "소아"]
    if sex in ("F","M"): terms.append(f"성별:{sex}")

    if m.get("situp_reps") is not None: terms += ["복근", "체간", "코어"]
    if m.get("reach_cm") is not None: terms += ["좌전굴", "햄스트링", "유연성"]
    if m.get("step_vo2max") is not None: terms += ["VO2max", "심폐", "중강도", "고강도"]

    return list(dict.fromkeys(terms))

def retrieve_acsm_candidates(payload: Dict[str, Any], top_k: int = 8) -> List[Dict[str, Any]]:
    meta = _load_acsm_meta()
    if not meta:
        return []
    terms = _mk_terms(payload)
    scored: List[Tuple[int, Dict[str, Any]]] = []
    for it in meta:
        text = " ".join([
            it.get("title") or "",
            " ".join(it.get("keywords") or []),
            it.get("excerpt") or ""
        ])
        s = _match_score(text, terms)
        if s > 0:
            scored.append((s, it))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in scored[:top_k]]

# ───────── 상태 리포트 ─────────
BASE = Path(__file__).resolve().parent
def rag_status() -> Dict[str, Any]:
    structured_store = BASE / "embed_store" / "csv"
    kspo_store = BASE / "embed_store" / "kspo_videos"
    acsm_store = BASE / "embed_store" / "acsm6"
    return {
        "csv_structured_files": {
            "index": (structured_store / "faiss_structured.index").exists(),
            "pipeline": (structured_store / "structured_pipeline.joblib").exists(),
            "meta": (structured_store / "structured_meta.json").exists(),
        },
        "kspo_video_files": {
            "meta": (kspo_store / "kspo_meta.json").exists(),
        },
        "acsm6_files": {
            "meta": (acsm_store / "acsm6_meta.json").exists(),
        },
    }

# ───────── KSPO 유형(T) & 헤더 고정 헬퍼 ─────────
def _type_line_for_category(cat: str, kspo_plan: Dict[str, Any], max_names: int = 2) -> str:
    freq_map = (kspo_plan.get("top_per_category", {}) or {}).get(cat) or {}
    top_names = list(freq_map.keys())[:max_names]
    v = (kspo_plan.get("videos", {}) or {}).get(cat) or {}
    vtitle = v.get("title") or "(대표영상 없음)"
    vyoutube = v.get("youtube_url") or ""
    names = ", ".join(top_names) if top_names else "(CSV 근거 부족)"
    if vyoutube:
        return f"{names} · 대표영상: {vtitle} (YouTube: {vyoutube})"
    return f"{names} · 대표영상: {vtitle}"

def _head_line_for_category(cat: str, kspo_plan: Dict[str, Any]) -> str:
    v = (kspo_plan.get("videos", {}) or {}).get(cat) or {}
    title = v.get("title")
    if title:
        return title
    freq_map = (kspo_plan.get("top_per_category", {}) or {}).get(cat) or {}
    if freq_map:
        return list(freq_map.keys())[0]
    return "(CSV 근거 부족)"

# ───────── 카드 포맷터(최종 양식 강제) ─────────
def _format_fitt_card(
    *,
    name: str,
    freq: str,
    inten: str,
    time_: str,
    type_text: str,
    video_title: str,
    rule_or_caution: str,
    csv_id: str = ""
) -> str:
    lines = [
        "종목",
        f"{name}",
        "빈도(F)",
        f"{freq}",
        "강도(I)",
        f"{inten}",
        "시간(T)",
        f"{time_}",
        "유형(T)",
        f"{type_text}",
        f"(대표영상: {video_title})",
        "진행규칙·주의",
        f"{rule_or_caution}",
        f"🎬 {video_title}",
    ]
    if str(csv_id).strip():
        lines.append(f"CSV:{csv_id}")
    return "\n".join(lines).strip()

# ───────── LLM 응답 파서(콜론/개행 둘 다 허용) ─────────
def _grab_after(label_pat: str, block: str) -> str:
    m = re.search(rf"{label_pat}\s*\n\s*(.+)", block)
    if m: return m.group(1).strip()
    m = re.search(rf"{label_pat}\s*:\s*(.+)", block)
    return m.group(1).strip() if m else ""

def _csv_from(block: str) -> str:
    m = re.search(r"\[CSV:(\d+)\]", block)
    return m.group(1) if m else ""

def _cut(ans: str, start_pat: str, end_pats: List[str]) -> str:
    m = re.search(start_pat, ans)
    if not m: return ""
    s = m.start()
    ends = []
    for p in end_pats:
        mm = re.search(p, ans[s+1:])
        if mm: ends.append(s + 1 + mm.start())
    e = min(ends) if ends else len(ans)
    return ans[s:e].strip()

def _split_main_sections(ans: str) -> Tuple[str, str, str]:
    a = _cut(ans, r"\b1\)\s*유산소\(심폐\)", [r"\n2\)\s*근력/근지구력", r"\n3\)\s*유연성"])
    s = _cut(ans, r"\b2\)\s*근력/근지구력", [r"\n3\)\s*유연성"])
    f = _cut(ans, r"\b3\)\s*유연성", [])
    return a or "", s or "", f or ""

def _cards_from_llm(answer: str, kspo_plan: Dict[str, Any], csv_neighbors: List[Dict[str, Any]]) -> str:
    a_blk, s_blk, f_blk = _split_main_sections(answer)

    # 유산소
    a_name = _grab_after(r"종목", a_blk)
    a_freq = _grab_after(r"빈도\(F\)", a_blk) or "주 3회"
    a_intn = _grab_after(r"강도\(I\)", a_blk) or "심박수 120~150 bpm 또는 RPE 12-15"
    a_time = _grab_after(r"시간\(T\)", a_blk) or "회당 30분"
    a_type = _grab_after(r"유형\(T\)", a_blk) or _type_line_for_category("심폐지구력", kspo_plan)
    a_rule = _grab_after(r"진행규칙·주의", a_blk) or "유산소 전 동적 스트레칭 포함, 통증 시 즉시 중단."
    a_csv  = _csv_from(a_blk) or str((csv_neighbors or [{}])[0].get("row_id") or "")
    v_a = (kspo_plan.get("videos", {}) or {}).get("심폐지구력") or {}
    a_video = v_a.get("title") or _head_line_for_category("심폐지구력", kspo_plan)

    # 근력/근지구력
    s_name = _grab_after(r"종목", s_blk)
    s_freq = _grab_after(r"빈도\(F\)", s_blk) or "주 2~3회(비연속일)"
    s_intn = _grab_after(r"강도\(I\)", s_blk) or "1RM 60% 또는 10~15회 가능 중량"
    s_time = _grab_after(r"시간\(T\)", s_blk) or "회당 20~40분"
    s_type = _grab_after(r"유형\(T\)", s_blk) or _type_line_for_category("근력/근지구력", kspo_plan)
    s_rule = _grab_after(r"주의/대안", s_blk) or "통증 없는 범위, 세트 간 60~90초 휴식."
    s_csv  = _csv_from(s_blk) or str((csv_neighbors or [{}])[0].get("row_id") or "")
    v_s = (kspo_plan.get("videos", {}) or {}).get("근력/근지구력") or {}
    s_video = v_s.get("title") or _head_line_for_category("근력/근지구력", kspo_plan)

    # 유연성
    f_name = _grab_after(r"종목", f_blk)
    f_freq = _grab_after(r"빈도\(F\)", f_blk) or "주 3~5회"
    f_intn = _grab_after(r"강도\(I\)", f_blk) or "통증 없는 범위에서 천천히 신장"
    f_time = _grab_after(r"시간\(T\)", f_blk) or "부위당 20~30초×2~4세트"
    f_type = _grab_after(r"유형\(T\)", f_blk) or _type_line_for_category("유연성", kspo_plan)
    f_rule = "호흡을 참지 말고 반동 없이 유지."
    f_csv  = _csv_from(f_blk) or str((csv_neighbors or [{}])[0].get("row_id") or "")
    v_f = (kspo_plan.get("videos", {}) or {}).get("유연성") or {}
    f_video = v_f.get("title") or _head_line_for_category("유연성", kspo_plan)

    card_aero = _format_fitt_card(
        name=a_name or _head_line_for_category("심폐지구력", kspo_plan),
        freq=a_freq, inten=a_intn, time_=a_time,
        type_text=a_type, video_title=a_video,
        rule_or_caution=a_rule, csv_id=a_csv
    )
    card_strn = _format_fitt_card(
        name=s_name or _head_line_for_category("근력/근지구력", kspo_plan),
        freq=s_freq, inten=s_intn, time_=s_time,
        type_text=s_type, video_title=s_video,
        rule_or_caution=s_rule, csv_id=s_csv
    )
    card_flex = _format_fitt_card(
        name=f_name or _head_line_for_category("유연성", kspo_plan),
        freq=f_freq, inten=f_intn, time_=f_time,
        type_text=f_type, video_title=f_video,
        rule_or_caution=f_rule, csv_id=f_csv
    )
    return "\n\n".join([card_aero, card_strn, card_flex]) + "\n"

# ───────── OpenAI 호출 ─────────
def call_openai(system_prompt: str, user_prompt: str) -> str:
    try:
        client = _get_openai_client()
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_tokens=1200,
        )
        return (completion.choices[0].message.content or "").strip()
    except Exception as e:
        return f"⚠️ LLM 호출 중 오류 발생: {e}"

def _fmt_allowlist(top_per_category: Dict[str, Dict[str,int]], videos: Dict[str, Any], n:int=5) -> str:
    out = ["### 허용 종목/대표 영상 (카테고리별)"]
    for cat in VALID_CATS:
        freq_map = top_per_category.get(cat) or {}
        names_sorted = sorted(freq_map.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
        names = [f"{i+1}. {name} (x{cnt})" for i, (name, cnt) in enumerate(names_sorted)]
        v = (videos or {}).get(cat) or {}
        vline = f"- 대표영상: {v.get('title','(없음)')} (YouTube: {v.get('youtube_url','')})"
        out.append(f"\n**{cat}**\n- 허용 종목 Top{n}: " + (", ".join(names) if names else "(없음)") + f"\n{vline}")
    return "\n".join(out)

def _fmt_csv_block(csv_neighbors: List[Dict[str, Any]]) -> str:
    lines = []
    for n in (csv_neighbors or []):
        score = _score_of(n)
        lines.append(
            f"[CSV:{n.get('row_id')}] (유사도 {score:.2f}) "
            f"성별 {n.get('sex')} · 나이 {n.get('age')} · BMI {n.get('bmi')} · "
            f"싯업 {n.get('situp_reps')} · 좌전굴 {n.get('reach_cm')}cm · VO₂max {n.get('vo2max')}\n"
            f"처방 요약: {(n.get('prescription_text') or '').strip()}"
        )
    return "\n\n".join(lines) if lines else "(유사 사례 없음)"

def _fmt_acsm_block(cands: List[Dict[str, Any]]) -> str:
    if not cands:
        return "(ACSM6 근거 없음)"
    lines = []
    for it in cands:
        did = it.get("doc_id") or "ACSM6:UNK"
        title = it.get("title") or "(제목 없음)"
        excerpt = (it.get("excerpt") or "").strip()
        if len(excerpt) > 240:
            excerpt = excerpt[:240].rstrip() + "…"
        lines.append(f"[ACSM6:{did}] {title}\n- 핵심: {excerpt}")
    return "\n\n".join(lines)

def build_kspo_prompt(payload: Dict[str, Any],
                      csv_neighbors: List[Dict[str, Any]],
                      kspo_plan: Dict[str, Any],
                      acsm_cands: List[Dict[str, Any]]) -> Dict[str, str]:
    u = payload.get("user", {}) or {}
    m = payload.get("measurements", {}) or {}

    allow_md = _fmt_allowlist(kspo_plan.get("top_per_category", {}), kspo_plan.get("videos", {}))
    csv_md   = _fmt_csv_block(csv_neighbors)
    acsm_md  = _fmt_acsm_block(acsm_cands)

    # 설문 완전 제거: 설문 JSON/요약/블록 없음
    system = (
        "당신은 임상 운동전문가이자 운동처방 코치입니다. 한국어로 작성합니다. "
        "아래 ‘출력 형식’의 제목/라벨/순서/구두점을 그대로 따르세요. "
        "유형(T) 자리표시자(<<TYPE_*>>)와 종목 헤드(<<HEAD_*>>)는 그대로 출력합니다(후처리로 치환됨). "
        "모든 권고 항목에 대해 필요시 [CSV:row_id], [ACSM6:doc_id]를 포함하되 과잉 인용은 금지합니다.\n"
        "[원칙] KSPO 허용 리스트 내 종목/영상만 사용, FITT 수치 명확, 안전 최우선."
    )

    user_prompt = (
        "=== 사용자 요약 ===\n"
        f"성별: {u.get('sex')} | 나이: {u.get('age')}\n"
        f"키/체중/BMI: {u.get('height_cm')}cm / {u.get('weight_kg')}kg / {u.get('bmi')}\n"
        f"측정치: 싯업 {m.get('situp_reps')}회 · 좌전굴 {m.get('reach_cm')}cm · VO₂max {m.get('step_vo2max')}\n"
        "\n=== 허용 리스트(필수 준수; KSPO 매칭 결과) ===\n" + allow_md +
        "\n\n=== 유사 사례 근거 Top-K (CSV) ===\n" + csv_md +
        "\n\n=== ACSM6 근거 후보 ===\n" + acsm_md +
        "\n\n[출력 형식]\n"
        "맞춤 운동처방 (4~6주)\n"
        "1) 유산소(심폐)\n"
        "종목: <<HEAD_AERO>>\n"
        "\n"
        "빈도(F): 주 3회\n"
        "강도(I): 심박수 XX~YY bpm 또는 RPE XX\n"
        "시간(T): 회당 XX분\n"
        "유형(T): <<TYPE_AERO>>\n"
        "진행규칙·주의: …\n"
        "근거: [CSV:row_id], [ACSM6:doc_id]\n"
        "2) 근력/근지구력\n"
        "종목: <<HEAD_STRENGTH>>\n"
        "\n"
        "빈도(F): 주 2회\n"
        "강도(I): 1RM XX% 또는 X~Y회 가능 중량\n"
        "시간(T): X세트×Y회, 세트 간 ZZ초\n"
        "유형(T): <<TYPE_STRENGTH>>\n"
        "주의/대안: …\n"
        "근거: [CSV:row_id], [ACSM6:doc_id]\n"
        "3) 유연성\n"
        "종목: <<HEAD_FLEX>>\n"
        "\n"
        "빈도(F): 주 4회\n"
        "시간(T): 부위당 XX초×X세트\n"
        "강도(I): 통증 없는 범위\n"
        "유형(T): <<TYPE_FLEX>>\n"
        "근거: [CSV:row_id], [ACSM6:doc_id]\n"
        "\n"
        "근거 추적표\n"
        "| 항목 | 선택 이유(핵심) | CSV | ACSM6 |\n"
        "|---|---|---|---|\n"
    )
    return {"system": system, "user": user_prompt}

def generate_prescription_kspo_only(
    payload: Dict[str, Any],
    *,
    top_k: int = 10,
    per_cat: int = 1,
    acsm_top_k: int = 8
) -> Dict[str, Any]:
    u = payload.get("user", {}) or {}
    m = payload.get("measurements", {}) or {}
    csv_neighbors = retrieve_similar_structured(u, m, top_k=top_k, overfetch=top_k*10)

    freq = _extract_names_from_csv_neighbors(csv_neighbors)

    kspo_meta_path = _kspo_meta_path()
    user_age = (payload.get("user") or {}).get("age")
    kspo_plan = prescribe_from_freq_and_kspo(freq, kspo_meta_path, user_age=user_age)

    # 연령대 타깃 리랭크
    meta_rows = _load_json_list(_kspo_meta_path())
    user_band = _age_band_from_age(user_age)
    for cat in VALID_CATS:
        v = (kspo_plan.get("videos", {}) or {}).get(cat) or {}
        title = v.get("title") or ""
        if not title:
            continue
        best = _rerank_video_by_age_and_target(
            picked=v, title=title, category=cat,
            user_age_band=user_band, meta_rows=meta_rows,
        )
        if best and best is not v:
            kspo_plan["videos"][cat] = best

    acsm_cands = retrieve_acsm_candidates(payload, top_k=acsm_top_k)

    prompts = build_kspo_prompt(payload, csv_neighbors, kspo_plan, acsm_cands)
    answer = call_openai(prompts["system"], prompts["user"]) or ""

    # 자리표시자 치환
    aero_head = _head_line_for_category("심폐지구력", kspo_plan)
    str_head  = _head_line_for_category("근력/근지구력", kspo_plan)
    flex_head = _head_line_for_category("유연성", kspo_plan)

    aero_line = _type_line_for_category("심폐지구력", kspo_plan)
    str_line  = _type_line_for_category("근력/근지구력", kspo_plan)
    flex_line = _type_line_for_category("유연성", kspo_plan)

    answer = (answer
        .replace("<<HEAD_AERO>>", aero_head)
        .replace("<<HEAD_STRENGTH>>", str_head)
        .replace("<<HEAD_FLEX>>", flex_head)
        .replace("<<TYPE_AERO>>", aero_line)
        .replace("<<TYPE_STRENGTH>>", str_line)
        .replace("<<TYPE_FLEX>>", flex_line)
    )

    cards_text = _cards_from_llm(answer, kspo_plan, csv_neighbors)

    # 설문 블록 완전 제거 → extra_md 없음
    extra_md = _advice_from_surveys_llm(payload, acsm_cands)  

    def _as_int(x):
        try: return int(float(x))
        except Exception: return None
    def _project_video(v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not v: return None
        return {
            "title": v.get("title") or "",
            "fitness_category": v.get("fitness_category") or "",
            "tool": v.get("tool") or "",
            "body_part": v.get("body_part") or "",
            "target": v.get("target") or "",
            "disease": v.get("disease") or "",
            "youtube_id": v.get("youtube_id") or "",
            "youtube_url": v.get("youtube_url") or "",
            "thumb_url": v.get("thumb_url") or "",
            "page_no": _as_int(v.get("page_no")),
            "rank_on_page": _as_int(v.get("rank_on_page")),
        }
    videos_projected = {cat: _project_video(kspo_plan.get("videos", {}).get(cat)) for cat in VALID_CATS}

    return {
        "planText": {
            "planText": (cards_text + extra_md).strip(),
            "cardsOnly": cards_text.strip(),
            "debug": {
                "query": "csv-kNN → KSPO allow-list + ACSM6 (+age-target rerank)",
                "args": {"top_k": top_k, "per_cat": per_cat, "acsm_top_k": acsm_top_k},
                "retrieved_csv": [
                    {"score": _score_of(n), "meta": {"row_id": n.get("row_id")}}
                    for n in (csv_neighbors or [])
                ],
                "kspo_top_per_category": kspo_plan.get("top_per_category", {}),
                "kspo_videos": videos_projected,
                "acsm_candidates": [
                    {"doc_id": c.get("doc_id"), "title": c.get("title")}
                    for c in (acsm_cands or [])
                ],
                "rag_status": rag_status(),
            },
        },
        "case_refs": csv_neighbors,
        "kspo": {
            "top_per_category": kspo_plan.get("top_per_category", {}),
            "videos": videos_projected,
            "unknown_items": kspo_plan.get("unknown_items", []),
            "categorized": kspo_plan.get("categorized", {}),
            "freq": kspo_plan.get("freq", {}),
        },
        "acsm6": {
            "candidates": acsm_cands or [],
        },
    }

# 내부: 메타 로드(JSON list 지원)
def _load_json_list(path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        return data.get("docs") or data.get("items") or []
    except Exception:
        return []

__all__ = ["generate_prescription_kspo_only", "rag_status", "_get_openai_client"]


# === REPLACE: 설문 요약 → Markdown ============================================
def _surveys_to_md(payload: Dict[str, Any]) -> str:
    surveys = payload.get("surveys") or {}
    u = payload.get("user") or {}
    m = payload.get("measurements") or {}

    # ---------- Survey1 (PAR-Q: 7문항 + high_risk) ----------
    s1 = surveys.get("survey1") or {}
    s1_items = s1.get("items") or []
    s1_yes = [it for it in s1_items if (it.get("answer") == "예")]
    s1_yes_list = [f"{it.get('no')}. {it.get('question')}" for it in s1_yes]

    # 안전 신호 플래그
    parq_flags = {
        "any_yes": any(True for _ in s1_yes),
        "yes_items_count": len(s1_yes),
        "high_risk": bool(s1.get("high_risk")),
        # 특정 중요 문항(흉통/실신/의사진단 등)에 가중치를 둘 수 있도록 번호 보존
        "critical_nos": [it.get("no") for it in s1_yes if it.get("no") in (1,2,3,5,6,7)],
    }

    # ---------- Survey4 (노쇠/Frailty) ----------
    s4 = surveys.get("survey4") or {}
    s4_yes_cnt = int(s4.get("yes_count") or 0)
    # 체중감소(문항 4) 세부
    wt_loss_kg = None
    try:
        it4 = next((x for x in (s4.get("items") or []) if x.get("no")==4), None)
        if it4 and it4.get("answer") == "예":
            wt_loss_kg = (it4.get("extra") or {}).get("weight_loss_kg")
    except: 
        pass

    frailty = {
        "yes_count": s4_yes_cnt,
        "weight_loss_kg": wt_loss_kg,
        "prefrail_or_frail": "frail" if s4_yes_cnt >= 3 else ("prefrail" if s4_yes_cnt >= 1 else "robust"),
    }

    # ---------- Survey2 (동기/장벽) ----------
    s2 = surveys.get("survey2") or {}
    barriers = s2.get("barriers") or []
    motive = (s2.get("motive") or "").strip()
    past = s2.get("past_exercise") or {}
    behavior = {
        "motive": motive,
        "barriers": barriers,
        "has_past_exercise": bool(past.get("has_experience")),
        "preferred_time": s2.get("preferred_time") or "",
        "preferred_place": s2.get("preferred_place") or "",
        "social_support": s2.get("social_support") or "",  # 있으면 친구/가족/동호회 등
    }

    # ---------- Survey3 (IPAQ) ----------
    s3 = surveys.get("survey3") or {}
    def _mins(days, per_day): 
        try: return max(0,int(days or 0))*max(0,int(per_day or 0))
        except: return 0
    vig = s3.get("vigorous") or {"days":0,"min_per_day":0,"none":False}
    mod = s3.get("moderate") or {"days":0,"min_per_day":0,"none":False}
    wlk = s3.get("walking")  or {"days":0,"min_per_day":0,"none":False}
    weekly_vig = _mins(vig.get("days",0), vig.get("min_per_day",0))
    weekly_mod = _mins(mod.get("days",0), mod.get("min_per_day",0))
    weekly_wlk = _mins(wlk.get("days",0), wlk.get("min_per_day",0))
    weekly_meeq = weekly_mod + weekly_wlk + weekly_vig*2  # 고강도×2 가중

    # 간단 분류(ACSM/WHO 권고 대비)
    if weekly_meeq >= 300:
        ipaq_level = "high"
    elif weekly_meeq >= 150:
        ipaq_level = "moderate"
    else:
        ipaq_level = "low"

    ipaq = {
        "weekly_vigorous_min": weekly_vig,
        "weekly_moderate_min": weekly_mod,
        "weekly_walking_min": weekly_wlk,
        "weekly_moderate_equiv_min": weekly_meeq,
        "ipaq_level": ipaq_level,  # low / moderate / high
        "sitting_min_per_day": int(s3.get("sitting_min_per_day") or 0),
    }

    # ---------- 사용자/측정 ----------
    user_core = {
        "sex": u.get("sex"),
        "age": u.get("age"),
        "height_cm": u.get("height_cm"),
        "weight_kg": u.get("weight_kg"),
        "bmi": u.get("bmi"),
    }
    meas = {
        "situp_reps": (m.get("situp_reps")),
        "reach_cm": (m.get("reach_cm")),
        "vo2max": (m.get("step_vo2max")),
    }

    # ---------- 사람이 읽을 수 있는 MD + 기계친화 JSON 블록 ----------
    import json
    obj = {
        "user": user_core,
        "measurements": meas,
        "safety": {"parq": parq_flags, "frailty": frailty},
        "behavior": behavior,
        "activity": ipaq,
    }

    md = (
        "#### 설문/측정 구조 요약(JSON)\n"
        f"```json\n{json.dumps(obj, ensure_ascii=False, indent=2)}\n```\n"
        "※ 위 구조를 기반으로 안전/주의(1,4번), 동기·장벽/활동전략(2,3번)을 분리 반영하세요."
    )
    return md



 # === LLM 기반 설문 맞춤 ACSM6 조언 ======================================
def _advice_from_surveys_llm(payload: Dict[str, Any], acsm_cands: List[Dict[str, Any]]) -> str:
    """
    Survey1/4 → 안전·주의/금기·자각증상 대응
    Survey2/3 → 동기/장벽, 활동수준(IPAQ) 기반 행동전략·목표 설계
    출력은 섹션화하고, 적절한 [ACSM6:doc_id] 인용 포함.
    """
    surveys_md = _surveys_to_md(payload)

    def _short(s: str, n: int = 400) -> str:
        s = (s or "").strip()
        return (s[:n].rstrip()+"…") if len(s) > n else s

    acsm_lines = []
    for c in (acsm_cands or []):
        did = c.get("doc_id") or "ACSM6:UNK"
        ttl = c.get("title") or "(제목 없음)"
        exc = _short(c.get("excerpt") or "")
        kws = ", ".join(c.get("keywords") or [])
        acsm_lines.append(f"- {did} | {ttl}\n  - keywords: {kws}\n  - excerpt: {exc}")
    acsm_md = "\n".join(acsm_lines) if acsm_lines else "(ACSM6 후보 없음)"

    system_prompt = (
        "당신은 임상 운동전문가이자 **ACSM 제6판(ACSM6)** 기반 코치입니다. "
        "사용자 맞춤 **실행가능 조언**을 한국어로 제공합니다. "
        "모든 권고는 안전을 최우선으로 합니다. "
        "과장된 의학적 단정은 피하고, 위험 신호 시 즉시 중단/전문가 상담을 권고합니다."
    )

    user_prompt = (
        "### 입력 데이터\n"
        "아래는 구조화된 설문/측정 요약(JSON)과 RAG로 찾은 ACSM6 후보입니다.\n\n"
        f"{surveys_md}\n\n"
        "#### ACSM6 후보\n"
        f"{acsm_md}\n\n"
        "### 작성 규칙 (중요)\n"
        "1) 문항-권고 매핑 원칙 (설문1·4)\n"
        "   - 설문1(PAR-Q) 및 설문4(균형·보행보조 등)에서 answer == '예'인 문항을 모두 추출하여 안전·주의 조항을 작성한다.\n"
        "   - 각 '예' 문항마다 **문항 요약 → 위험/주의 근거 → 즉시 적용 조치 → 대체/수정 운동** 순으로 제시한다.\n"
        "   - 모든 문항이 '아니오'일 경우 일반적인 안전 수칙만 간략히 제시한다.\n"
        "   - 상충 시 안전을 최우선으로 하며, 의학적 평가 필요 여부를 명확히 한다.\n"
        "\n"
        "2) 목표·동기·실행 전략 (설문2·3 기반)\n"
        "   - 설문2의 운동 목적, 과거 운동경험, 운동 지속의 어려움을 반영하여 **목표 달성 및 동기유지 전략**을 작성한다.\n"
        "   - 설문3(IPAQ)의 신체활동 수준(빈도·시간·좌식시간 등)을 함께 분석하여 **실행 가능성·행동 조정 팁**을 포함한다.\n"
        "   - 신체활동 시간이 부족할 경우, 생활 속 활동량을 늘리는 구체적 방안을 제시한다.\n"
        "   - 신체활동 시간이 충분할 경우, 현재의 노력을 긍정적으로 강화(칭찬·격려)하는 피드백을 제공한다.\n"
        "\n"
        "### 출력 형식 (마크다운)\n"
        "#### 사용자 진단\n"
        "- ‘예’ 문항 매핑표\n"
        "{각 예 문항마다 아래 템플릿 반복}\n"
        "- **상태:** {문항을 자연어로 요약}\n"
        "  - **근거/위험:** {주의가 필요한 이유}\n"
        "  - **즉시 적용 조치:** {강도/빈도/볼륨/휴식 등 구체 수치}\n"
        "  - **대체/수정 운동:** {금기/주의 동작의 대안}\n"
        "\n"
        "#### 사용자 맞춤 전략\n"
        "- **사용자 요약:** {설문2 요약}\n"
        "  - **격려 메시지:** {동기 강화}\n"
        "  - **장벽 극복 팁:** {해결 방안}\n"
        "- **활동수준 요약:** {설문3 요약}\n"
        "  - **실행 피드백:** {부족/충분에 따른 조언}\n"
    )

    ans = call_openai(system_prompt, user_prompt)
    if not ans or ans.startswith("⚠️ LLM 호출 중 오류"):
        return ""
    return "\n---\n### 설문 기반 ACSM6 조언(LLM)\n" + ans.strip() + "\n"
