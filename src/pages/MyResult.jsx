// src/pages/MyResult.jsx
import React, { useEffect, useState } from "react";
import { listResults, getResult } from "../api/review.js";
import PlanCards from "../components/PlanCards.jsx";
import PlanCalendar from "../components/PlanCalendar.jsx";
import ReactMarkdown from "react-markdown";

/* ───────── helpers ───────── */
function calcBMI(w, h) {
  const W = Number(w), H = Number(h);
  if (!W || !H) return null;
  return Number((W / ((H / 100) ** 2)).toFixed(1));
}
function bmiBadge(bmi) {
  if (bmi == null) return { label: "-", color: "#64748b" };
  if (bmi < 18.5) return { label: "저체중", color: "#3b82f6" };
  if (bmi < 23)   return { label: "정상",   color: "#16a34a" };
  if (bmi < 25)   return { label: "과체중", color: "#f59e0b" };
  return { label: "비만", color: "#ef4444" };
}

const ADVICE_MARK = "### 설문 기반 ACSM6 조언(LLM)";
function splitPlanMd(planMd = "") {
  if (!planMd) return { cardsMd: "", adviceMd: "" };
  const idx = planMd.indexOf(ADVICE_MARK);
  if (idx < 0) return { cardsMd: planMd, adviceMd: "" };
  return {
    cardsMd: planMd.slice(0, idx).trim(),
    adviceMd: planMd.slice(idx).trim(),
  };
}

// 🔐 정책: 검수 완료만 노출 (true 고정)
const REQUIRE_APPROVED = true;

// ✅ "complete" 상태만 승인으로 간주 (구버전 호환: approved=true도 통과)
function isApprovedLike(row) {
  const st = String(row?.status || "").toLowerCase();
  return st === "complete" || row?.approved === true;
}

// ✅ getResult로 받아온 full 객체를 목록 한 줄 요약 형태로 변환
function summarize(full) {
  return {
    id: full?.id,
    trace_id: full?.trace_id,
    name: full?.user?.name ?? "-",
    sex: full?.user?.sex ?? "-",
    age: full?.user?.age ?? "-",
    created_at: full?.created_at ?? "",
    approved: isApprovedLike(full),
    status: full?.status ?? "",
  };
}

export default function MyResult() {
  const [searchKey, setSearchKey] = useState(""); // id / trace_id / userId / q
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);         // 목록(간략)
  const [detail, setDetail] = useState(null);     // 상세(한 건)
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);

  // ▼ 캘린더 컨트롤 상태 (4~6주/시작일)
  const [weeksCal, setWeeksCal] = useState(4);
  const [startDateCal, setStartDateCal] = useState(null);

  // 로컬스토리지의 userId를 기본 검색키로 주입 (초기 UX)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai_fitness_user");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.userId) setSearchKey(parsed.userId);
      if (parsed?.id && !parsed.userId) setSearchKey(parsed.id); // Start.jsx의 저장 포맷 대비
    } catch {}
  }, []);

  async function doSearch(nextKey) {
    const key = (nextKey ?? searchKey ?? "").trim();
    if (!key) {
      setErr("검색 키(id / trace_id / userId / 키워드)를 입력하세요.");
      setItems([]); setDetail(null);
      return;
    }

    setErr(""); setLoading(true);
    try {
      // ── 1) 서버 검색
      let data = await listResults({ page: 1, size: 50, q: key });
      let list = Array.isArray(data?.items) ? data.items.slice() : [];

      // ── 2) 클라단 재필터: complete만 남김
      if (REQUIRE_APPROVED) list = list.filter(isApprovedLike);

      // 최신순 정렬
      list.sort((a, b) => {
        const ta = new Date(a?.created_at || 0).getTime();
        const tb = new Date(b?.created_at || 0).getTime();
        return tb - ta;
      });

      // ── 3) 목록이 비었으면: id/trace_id 직접 조회 폴백
      if (!list.length) {
        try {
          const full = await getResult(key);
          if (REQUIRE_APPROVED && !isApprovedLike(full)) {
            setItems([]); setDetail(null);
            setErr("검수 완료(complete) 결과가 아닙니다.");
            return;
          }
          const row = summarize(full);
          setItems([row]);
          setDetail(full);
          setLoading(false);
          return;
        } catch {
          setItems([]);
          setDetail(null);
          setErr("검수 완료된 결과가 없습니다. (complete 상태만 조회됩니다)");
          setLoading(false);
          return;
        }
      }

      // ── 4) 정확 매칭 우선 선택 (없으면 첫 번째)
      const exact = list.find(r => r.id === key || r.trace_id === key);
      const targetId = (exact ? exact.id : list[0].id);

      const full = await getResult(targetId);
      if (REQUIRE_APPROVED && !isApprovedLike(full)) {
        setDetail(null);
        setErr("이 결과는 아직 검수 완료(complete)가 아닙니다.");
        setItems(list);
        return;
      }

      setItems(list);
      setDetail(full);
    } catch (e) {
      setErr("조회 실패: " + (e.message || "unknown"));
      setItems([]); setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  // 상세 파생값
  const planMd = ((detail?.planMd ?? detail?.plan_md) || "") + "";
  const { cardsMd, adviceMd } = splitPlanMd(planMd || "");

  const user = detail?.user ?? {};
  const name = user?.name || "-";
  const sex = user?.sex || "-";
  const age = user?.age ?? "-";
  const height = user?.height_cm ?? "-";
  const weight = user?.weight_kg ?? "-";
  const bmi = calcBMI(weight, height);
  const bmiInfo = bmiBadge(bmi);

  return (
    <div className="page">
      {/* ───────────────────── Start.jsx와 동일 톤&무드 CSS ───────────────────── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        :root{
          --radius:16px; --inpH:56px; --font:16px; --label:13px;
          --stroke:#c8d6f0; --stroke2:#99b6f0; --text:#0f1b2d; --muted:#667085;
          --brand:#112a66; --brand-hover:#173a8e;
          --chip-bg:rgba(13,110,253,.08); --chip-stroke:rgba(13,110,253,.18); --chip-fg:#0b5cab;
          --gap-col:15px; --gap-row:10px;
          --panel-stroke: rgba(15,23,42,.08);
        }
        .page{ min-height:100vh; display:flex; flex-direction:column; align-items:center;
               background:linear-gradient(180deg,#e8f0ff 0%,#ffffff 100%); padding:32px 16px; }
        .hero{ text-align:center; margin-bottom:16px; }
        .title{ font-size:2.2rem; font-weight:900; color:#082c7a; margin:0 0 8px }
        .subtitle{ margin:0; color:#475569; font-size:.95rem }
        .char{ width:164px; height:auto; margin:10px auto 6px; display:block }

        .card{ width:100%; max-width:1200px; background:#fff; border-radius:28px;
               border:1px solid var(--panel-stroke);
               box-shadow:0 18px 52px rgba(0,0,0,.10); padding:20px; }

        .rowBar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin: 10px 0 14px; }
        .input{ flex:1 1 420px; height:var(--inpH); font-size:var(--font); color:var(--text);
                border:1px solid var(--stroke); border-radius:var(--radius);
                background:#fff; outline:none; padding:0 16px;
                transition:border-color .15s, box-shadow .15s, background .15s; }
        .input:focus{ border-color:var(--stroke2); box-shadow:0 0 0 4px rgba(68,132,255,.15); }
        .btn{ border:1px solid #0b5cab; background:#0b5cab; color:#fff; border-radius:16px;
              padding:14px 16px; font-weight:900; min-width:120px; height:56px; cursor:pointer; }
        .btn:disabled{ opacity:.7; cursor:not-allowed }
        .btnGhost{ border:1px solid #cbd5e1; background:#fff; color:#0f172a;
                   border-radius:12px; padding:10px 12px; font-weight:800; cursor:pointer; }
        .error{ margin:10px 0; padding:12px 14px; border-radius:12px;
                border:1px solid #fecaca; background:#fee2e2; color:#b91c1c; font-size:13px }

        .tag{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px;
              font-size:12px; border:1px solid #e2e8f0; background:#f8fafc; color:#334155; }

        .panel{ background:#fff; border:1px solid var(--panel-stroke); border-radius:20px; overflow:hidden; box-shadow:0 18px 40px rgba(2,6,23,.06) }
        .panelHd{ padding:14px 16px; background:linear-gradient(180deg,#f8fafc,#ffffff); border-bottom:1px solid var(--panel-stroke);
                  display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .panelBd{ padding:16px; }

        .tbl{ width:100%; border-collapse:collapse; }
        .tbl th{ position:sticky; top:0; background:#fafafa; text-align:left; padding:10px; font-size:12px; color:#475569; border-bottom:1px solid #e5e7eb }
        .tbl td{ padding:10px; border-bottom:1px solid #f1f5f9; font-size:13px }
        .mono{ font-family: ui-monospace,Menlo,monospace }
        .rowBtn{ border:1px solid #cbd5e1; background:#fff; border-radius:8px; padding:6px 10px; cursor:pointer; font-weight:700 }
        .pill-ok{ background:#dcfce7; color:#166534; border:1px solid #bbf7d0; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800 }
        .pill-na{ background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800 }

        .profileGrid{ display:grid; grid-template-columns:100px 1fr; gap:8px 12px; font-size:14px }
      `}</style>

      {/* 히어로 + 캐릭터 */}
      <div className="hero">
        <img className="char" src="/character.png" alt="캐릭터" />
        <h1 className="title">최종 검사 결과지 조회</h1>
        <p className="subtitle">
          발급받은 <b>id</b>로 결과를 확인하세요.{" "}
          <span style={{ color:"#0f766e" }}>※ 운동 처방사가 검수 완료한 결과만 검색 가능합니다.</span>
        </p>
      </div>

      {/* 검색 카드 */}
      <div className="card" aria-label="검색 카드">
        <div className="rowBar">
          <input
            value={searchKey}
            onChange={(e)=>setSearchKey(e.target.value)}
            placeholder="예) 1570bb49-...  또는  e7a0c4ce-...  또는  usr_1234abcd"
            className="input"
            aria-label="검색 키"
            onKeyDown={(e)=>{ if(e.key === "Enter") doSearch(); }}
          />
          <button onClick={()=>doSearch()} className="btn" disabled={loading}>
            {loading ? "검색 중…" : "검색"}
          </button>
          {!!searchKey && (
            <button
              className="btnGhost"
              onClick={async()=>{ try{ await navigator.clipboard.writeText(searchKey);}catch{} }}
            >
              검색키 복사
            </button>
          )}
        </div>
        {err && <div className="error">{err}</div>}
      </div>

      {/* 목록 (complete만) */}
      {!!items.length && (
        <section className="panel" style={{ marginTop:16, width:"100%", maxWidth:1200 }}>
          <div className="panelHd" style={{ justifyContent:"space-between" }}>
            <b>검색 결과 목록 ({items.length}건)</b>
            <label style={{ fontSize:12, color:"#475569" }}>
              <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} /> 행 클릭 시 상세 열기
            </label>
          </div>
          <div className="panelBd">
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              <table className="tbl" role="table">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>trace_id</th>
                    <th>이름</th>
                    <th>성별</th>
                    <th>나이</th>
                    <th>승인</th>
                    <th>생성시각</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => (
                    <tr key={r.id}
                        onClick={()=>{ if(showAll){ setSearchKey(r.id); doSearch(r.id);} }}
                        style={{ cursor: showAll ? "pointer" : "default" }}>
                      <td className="mono">{r.id}</td>
                      <td className="mono">{r.trace_id}</td>
                      <td>{r.name}</td>
                      <td>{r.sex}</td>
                      <td>{r.age}</td>
                      <td>{isApprovedLike(r) ? <span className="pill-ok">검수됨</span> : <span className="pill-na">미승인</span>}</td>
                      <td>{r.created_at}</td>
                      <td>
                        <button className="rowBtn" onClick={(e)=>{ e.stopPropagation(); setSearchKey(r.id); doSearch(r.id); }}>
                          열기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 상세 (complete만 열림) */}
      {!!detail && (
        <div style={{ display:"grid", gap:16, marginTop:16, width:"100%", maxWidth:1200 }}>
          {/* 프로필 패널 */}
          <section className="panel" aria-label="개인 프로필">
            <div className="panelHd">
              <b>🧍 개인 프로필</b>
              <span className="tag" style={{ marginLeft:8 }}>id: <code className="mono">{detail.id}</code></span>
              <span className="tag" style={{ marginLeft:6 }}>trace_id: <code className="mono">{detail.trace_id}</code></span>
              <span className="tag" style={{ marginLeft:6 }}>{isApprovedLike(detail) ? "검수 완료" : "미승인"}</span>
            </div>
            <div className="panelBd">
              <div className="profileGrid">
                <div>이름</div><div>{name}</div>
                <div>성별</div><div>{sex}</div>
                <div>나이</div><div>{age} 세</div>
                <div>키</div><div>{height} cm</div>
                <div>체중</div><div>{weight} kg</div>
                <div>BMI</div>
                <div>
                  {bmi ?? "-"}{" "}
                  <span style={{
                    marginLeft: 8, padding: "2px 8px", borderRadius: 999,
                    fontSize: 12, fontWeight: 700,
                    background: `${bmiInfo.color}1a`, color: bmiInfo.color,
                    border: `1px solid ${bmiInfo.color}55`
                  }}>
                    {bmiInfo.label}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 처방 카드 */}
          <section className="panel" aria-label="맞춤 운동처방">
            <div className="panelHd"><b>맞춤 운동처방</b></div>
            <div className="panelBd">
              {(cardsMd || planMd).trim()
                ? <PlanCards planMd={cardsMd || planMd} />
                : <div style={{ color:"#64748b", fontSize:14 }}>plan_md가 비어 있습니다.</div>}
            </div>
          </section>

          {/* 설문 조언 */}
          {adviceMd && (
            <section className="panel" aria-label="설문 기반 맞춤형 조언">
              <div className="panelHd" style={{ justifyContent:"space-between" }}>
                <b>설문 기반 맞춤형 조언</b>
                <button className="btnGhost" onClick={async()=>{ try{ await navigator.clipboard.writeText(adviceMd);}catch{} }}>
                  조언 복사
                </button>
              </div>
              <div className="panelBd">
                <ReactMarkdown
                  components={{
                    h3: ({node, ...props}) => <h3 style={{margin:"14px 0 6px"}} {...props} />,
                    h4: ({node, ...props}) => <h4 style={{margin:"10px 0 4px"}} {...props} />,
                    li: ({node, ...props}) => <li style={{margin:"4px 0"}} {...props} />,
                    code: ({node, inline, ...props}) =>
                      inline
                        ? <code style={{background:"#f8fafc", padding:"2px 6px", borderRadius:6}} {...props} />
                        : <pre style={{background:"#0f172a", color:"#e2e8f0", padding:12, borderRadius:10, overflow:"auto"}}><code {...props} /></pre>
                  }}
                >
                  {adviceMd}
                </ReactMarkdown>
                <div style={{ marginTop:10, padding:"8px 10px", fontSize:12, color:"#0369a1",
                              background:"#e0f2fe", border:"1px dashed #bae6fd", borderRadius:10 }}>
                  ※ 본 조언은 일반적 정보이며, 증상 발현 시 즉시 중단하고 전문가와 상담하세요.
                </div>
              </div>
            </section>
          )}

          {/* 캘린더 */}
          {(planMd || "").trim() && (
            <section className="panel" aria-label="주간 계획표 (캘린더)">
              <div className="panelHd" style={{ justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:10, height:10, borderRadius:999, background:"#16a34a", boxShadow:"0 0 0 3px #22c55e33" }} />
                  <b>주간 계획표 (캘린더)</b>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <button
                    className="btnGhost"
                    style={{ boxShadow: weeksCal===4 ? "inset 0 0 0 1px #cbd5e1" : "none" }}
                    onClick={()=>setWeeksCal(4)}
                  >4주</button>
                  <button
                    className="btnGhost"
                    style={{ boxShadow: weeksCal===6 ? "inset 0 0 0 1px #cbd5e1" : "none" }}
                    onClick={()=>setWeeksCal(6)}
                  >6주</button>

                  <input
                    type="date"
                    style={{ border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", height: 44 }}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartDateCal(v ? new Date(v + "T09:00:00") : null);
                    }}
                  />
                </div>
              </div>

              <div className="panelBd">
                <PlanCalendar
                  planMd={planMd}
                  weeks={weeksCal}
                  startDate={startDateCal || undefined}
                />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
