// src/pages/MyResult.jsx
import React, { useEffect, useState } from "react";
import { listResults, getResult } from "../api/review.js";
import PlanCards from "../components/PlanCards.jsx";
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

// 서버 필드 호환: approved=true 또는 status==='final' 둘 중 하나만 있어도 승인으로 간주
function isApprovedLike(row) {
  return Boolean(row?.approved) || String(row?.status || "").toLowerCase() === "final";
}

export default function MyResult() {
  const [searchKey, setSearchKey] = useState(""); // id / trace_id / userId / q
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);         // 목록(간략)
  const [detail, setDetail] = useState(null);     // 상세(한 건)
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);

  // 로컬스토리지의 userId를 기본 검색키로 주입 (초기 UX)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai_fitness_user");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.userId) setSearchKey(parsed.userId);
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
      // 1) 서버 필터(가능하면 여기에서만 승인건 수신)
      let data = await listResults({
        page: 1, size: 50,
        id: key, traceId: key, q: key,
        approved: REQUIRE_APPROVED ? true : undefined,
        status: REQUIRE_APPROVED ? "final" : undefined,
      });

      let list = Array.isArray(data?.items) ? data.items.slice() : [];

      // 2) 서버가 approved/status 필터를 무시할 대비 → 클라단 재필터
      if (REQUIRE_APPROVED) {
        list = list.filter(isApprovedLike);
      }

      // 최신순 정렬
      list.sort((a, b) => {
        const ta = new Date(a?.created_at || 0).getTime();
        const tb = new Date(b?.created_at || 0).getTime();
        return tb - ta;
      });

      setItems(list);

      if (!list.length) {
        setDetail(null);
        setErr("검수 완료된 결과가 없습니다. (승인된 결과만 조회됩니다)");
        return;
      }

      // 정확 매칭 우선
      const exact = list.find(r => r.id === key || r.trace_id === key);
      const targetId = (exact ? exact.id : list[0].id);

      const full = await getResult(targetId);

      // 3) 상세 방어: 승인되지 않았으면 차단
      if (REQUIRE_APPROVED && !isApprovedLike(full)) {
        setDetail(null);
        setErr("이 결과는 아직 검수 완료가 아닙니다.");
        return;
      }

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
    <div style={S.page}>
      <style>{`
        .tag{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px;
              font-size:12px; border:1px solid #e2e8f0; background:#f8fafc; color:#334155; }
        .tbl{ width:100%; border-collapse:collapse; }
        .tbl th{ position:sticky; top:0; background:#fafafa; text-align:left; padding:8px; font-size:12px; color:#475569; border-bottom:1px solid #e5e7eb }
        .tbl td{ padding:8px; border-bottom:1px solid #f1f5f9; font-size:13px }
        .mono{ font-family: ui-monospace,Menlo,monospace }
        .rowBtn{ border:1px solid #cbd5e1; background:#fff; border-radius:8px; padding:4px 8px; cursor:pointer; font-weight:700 }
        .pill-ok{ background:#dcfce7; color:#166534; border:1px solid #bbf7d0; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800 }
        .pill-na{ background:#fee2e2; color:#991b1b; border:1px solid #fecaca; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800 }
      `}</style>

      <h1 style={S.title}>내 결과 조회</h1>
      <p style={S.sub}>
        id / trace_id / userId / 키워드로 검색할 수 있습니다.
        <span style={{marginLeft:8, fontSize:12, color:"#0f766e"}}>※ 검수 완료된 결과만 노출됩니다.</span>
      </p>

      <div style={S.searchBar}>
        <input
          value={searchKey}
          onChange={(e)=>setSearchKey(e.target.value)}
          placeholder="예) 1570bb49-...  또는  e7a0c4ce-...  또는  usr_1234abcd"
          style={S.input}
          aria-label="검색 키"
          onKeyDown={(e)=>{ if(e.key === "Enter") doSearch(); }}
        />
        <button onClick={()=>doSearch()} style={S.primaryBtn} disabled={loading}>
          {loading ? "검색 중…" : "검색"}
        </button>
        {!!searchKey && (
          <button
            style={S.btn}
            onClick={async()=>{ try{ await navigator.clipboard.writeText(searchKey);}catch{} }}
          >검색키 복사</button>
        )}
      </div>

      {err && <div style={S.error}>{err}</div>}

      {/* 목록 (승인건만) */}
      {!!items.length && (
        <section style={S.panel}>
          <div style={{...S.panelHd, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <b>검색 결과 목록 ({items.length}건)</b>
            <label style={{ fontSize:12, color:"#475569" }}>
              <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} /> 행 클릭 시 상세 열기
            </label>
          </div>
          <div style={S.panelBd}>
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              <table className="tbl">
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

      {/* 상세 (승인건만 열림) */}
      {!!detail && (
        <div style={{ display:"grid", gap:12, marginTop:12 }}>
          <section style={S.panel}>
            <div style={S.panelHd}>
              <b>🧍 개인 프로필</b>
              <span style={{ marginLeft:8 }} className="tag">id: <code className="mono">{detail.id}</code></span>
              <span style={{ marginLeft:6 }} className="tag">trace_id: <code className="mono">{detail.trace_id}</code></span>
              <span style={{ marginLeft:6 }} className="tag">{isApprovedLike(detail) ? "검수 완료" : "미승인"}</span>
            </div>
            <div style={S.panelBd}>
              <div style={S.profileGrid}>
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

          <section style={S.panel}>
            <div style={S.panelHd}><b>맞춤 운동처방</b></div>
            <div style={S.panelBd}>
              {(cardsMd || planMd).trim()
                ? <PlanCards planMd={cardsMd || planMd} />
                : <div style={{ color:"#64748b", fontSize:14 }}>plan_md가 비어 있습니다.</div>}
            </div>
          </section>

          {adviceMd && (
            <section style={S.panel}>
              <div style={{ ...S.panelHd, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <b>설문 기반 맞춤형 조언</b>
                <button style={S.btn} onClick={async()=>{ try{ await navigator.clipboard.writeText(adviceMd);}catch{} }}>
                  조언 복사
                </button>
              </div>
              <div style={S.panelBd}>
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
        </div>
      )}
    </div>
  );
}

const S = {
  page: { maxWidth: 1200, margin:"0 auto", padding:"18px", color:"#0f172a",
          fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,sans-serif" },
  title:{ fontSize:"1.8rem", margin:"0 0 6px", fontWeight:900, color:"#082c7a" },
  sub:{ margin:"0 0 14px", color:"#475569" },
  searchBar:{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" },
  input:{ flex:"1 1 480px", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 12px", fontSize:14 },
  btn:{ border:"1px solid #cbd5e1", background:"#fff", borderRadius:10, padding:"8px 10px", cursor:"pointer", fontWeight:700 },
  primaryBtn:{ border:"1px solid #0b5cab", background:"#0b5cab", color:"#fff", borderRadius:10, padding:"10px 14px", fontWeight:800 },
  error:{ margin:"8px 0", padding:"10px 12px", border:"1px solid #fecaca", background:"#fee2e2", color:"#b91c1c", borderRadius:10, fontSize:13 },

  panel:{ background:"#fff", border:"1px solid rgba(15,23,42,.08)", borderRadius:12, overflow:"hidden", boxShadow:"0 18px 40px rgba(2,6,23,.06)" },
  panelHd:{ padding:"12px 14px", background:"linear-gradient(180deg,#f8fafc,#ffffff)", borderBottom:"1px solid rgba(15,23,42,.06)" },
  panelBd:{ padding:14 },
  profileGrid:{ display:"grid", gridTemplateColumns:"100px 1fr", gap:"8px 12px", fontSize:14 },
};
