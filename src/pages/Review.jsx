// src/pages/Review.jsx
import React, { useEffect, useState, useCallback } from "react";
import { listResults, getResult, patchResult } from "../api/review.js";
import PlanCards from "../components/PlanCards.jsx";
import PlanCardsInlineWysiwyg from "../components/PlanCardsInlineWysiwyg.jsx";
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
  return { cardsMd: planMd.slice(0, idx).trim(), adviceMd: planMd.slice(idx).trim() };
}
function isComplete(row) {
  return String(row?.status || "").toLowerCase() === "complete";
}

/* ───────── small UI helpers ───────── */
function IdCell({ id }) {
  return (
    <div style={styles.idCellWrap} title={id}>
      <code style={styles.idCellCode}>{id}</code>
      <button
        style={styles.copyMini}
        aria-label="id 복사"
        onClick={async (e) => {
          e.stopPropagation();
          try { await navigator.clipboard.writeText(id); } catch {}
        }}
      >
        복사
      </button>
    </div>
  );
}

export default function Review() {
  // 좌측 리스트 상태
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size] = useState(50);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // 우측 상세
  const [cur, setCur] = useState(null);
  const [planMd, setPlanMd] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 인라인 카드 편집
  const [editMode, setEditMode] = useState(false);
  const [draftCards, setDraftCards] = useState("");

  const loadList = useCallback(async (p = page) => {
    try {
      setLoadingList(true);
      const data = await listResults({ page: p, size, q });
      setItems(data.items || []);
      setTotal(Number(data.total || 0));
      setPage(Number(data.page || p));
    } finally {
      setLoadingList(false);
    }
  }, [page, size, q]);

  useEffect(() => { loadList(1); }, [loadList]);

  async function openRow(row) {
    try {
      const data = await getResult(row.id || row.trace_id);
      setCur(data);
      const pm = (data?.planMd ?? data?.plan_md ?? "") + "";
      setPlanMd(pm);
      setEditMode(false);
      setDraftCards("");
      setStatus(data?.status ?? "");
      setMsg("");
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (e) {
      setMsg(e.message || "상세 조회 실패");
    }
  }

  function backToList() {
    setCur(null);
    setPlanMd("");
    setEditMode(false);
    setDraftCards("");
    setStatus("");
    setMsg("");
  }

  // 표기
  const user = cur?.user ?? {};
  const name = user?.name || "-";
  const sex = user?.sex || "-";
  const age = user?.age ?? "-";
  const height = user?.height_cm ?? "-";
  const weight = user?.weight_kg ?? "-";
  const bmi = calcBMI(weight, height);
  const bmiInfo = bmiBadge(bmi);

  // 저장 = 검수완료
  const handleSave = useCallback(async () => {
    if (!cur?.id) return;
    setSaving(true); setMsg("");
    try {
      const { adviceMd } = splitPlanMd(planMd || "");
      const baseCards = editMode ? (draftCards || "") : splitPlanMd(planMd || "").cardsMd;
      const merged = adviceMd ? `${baseCards}\n\n${adviceMd}`.trim() : baseCards;
      const nextStatus = "complete";
      await patchResult(cur.id, { planMd: merged, status: nextStatus });
      setMsg("✅ 저장되었습니다. (status: complete)");

      const data = await getResult(cur.id);
      const pm = (data?.planMd ?? data?.plan_md ?? "") + "";
      setCur(data);
      setPlanMd(pm);
      setEditMode(false);
      setStatus(nextStatus);

      loadList(page); // 왼쪽 리스트 갱신
    } catch (e) {
      setMsg("❌ 저장 실패: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }, [cur?.id, editMode, draftCards, planMd, loadList, page]);

  // 단축키
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); handleSave(); }
      if (e.key.toLowerCase() === "e" && cur) {
        setEditMode((v) => { const next = !v; if (next) setDraftCards(splitPlanMd(planMd || "").cardsMd || ""); return next;});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, planMd, cur]);

  const totalPages = Math.max(1, Math.ceil(total / size));
  const { cardsMd, adviceMd } = splitPlanMd(planMd || "");

  async function copyAdviceMdToClipboard() {
    try { await navigator.clipboard.writeText(adviceMd || ""); } catch {}
  }

  return (
    <div style={styles.shell}>
      {!cur ? (
        // ───────── 목록 화면 ─────────
        <aside style={styles.leftFull}>
          <div style={styles.toolbar}>
            <div style={styles.searchBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18zm0 0l7 4"
                      stroke="#64748b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
              <input
                placeholder="이름/성별/나이/JSON 검색"
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={(e)=>{ if(e.key==="Enter") loadList(1); }}
                style={styles.input}
                aria-label="검색어"
              />
            </div>
            <button style={styles.primaryBtnSm} onClick={()=>loadList(1)}>검색</button>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead style={styles.thead}>
                <tr>
                  <th style={{...styles.th, width:"44%"}}>id</th>
                  <th style={{...styles.th, width:"24%"}}>이름</th>
                  <th style={{...styles.th, width:"10%"}}>성별</th>
                  <th style={{...styles.th, width:"10%"}}>나이</th>
                  <th style={{...styles.th, width:"8%", textAlign:"center"}}>검수완료</th>
                  <th style={{...styles.th, width:"8%"}}></th>
                </tr>
              </thead>
              <tbody>
                {loadingList ? (
                  <tr><td style={styles.td} colSpan={6}>로딩 중…</td></tr>
                ) : items.length ? items.map((r, i) => {
                  const zebra = i % 2 === 1 && !isComplete(r);
                  return (
                    <tr
                      key={r.id}
                      style={{
                        ...styles.tr,
                        background: isComplete(r) ? "#f0fdf4" : (zebra ? "#fcfcff" : "#ffffff")
                      }}
                    >
                      <td style={styles.tdMono}><IdCell id={r.id} /></td>
                      <td style={styles.td}>{r.name}</td>
                      <td style={styles.tdChip}><span style={styles.chip}>{r.sex}</span></td>
                      <td style={styles.tdChip}><span style={styles.chip}>{r.age}</span></td>
                      <td style={styles.tdCenter}>
                        {isComplete(r) ? (
                          <span title="검수 완료" style={styles.statusOK} aria-label="완료">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" stroke="#16a34a" strokeWidth="2" fill="#dcfce7"/>
                              <path d="M7 12.5l3 3 7-7" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        ) : (
                          <span title={String(r?.status || "대기")} style={styles.statusNA} aria-label="미완료">—</span>
                        )}
                      </td>
                      <td style={styles.tdAct}>
                        <button style={styles.linkBtn} onClick={()=>openRow(r)}>열기</button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td style={styles.empty} colSpan={6}>
                      <div>검색 결과가 없습니다.</div>
                      <div style={{fontSize:12, color:"#64748b"}}>검색어를 바꾸거나 초기화해 보세요.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={styles.pager}>
            <button style={styles.btnGhost} disabled={page<=1}
              onClick={()=>{const p=page-1; setPage(p); loadList(p);}}>Prev</button>
            <div style={styles.pageInfo}>Page {page} / {totalPages} <span style={{opacity:.7}}>(총 {total}건)</span></div>
            <button style={styles.btnGhost} disabled={page>=totalPages}
              onClick={()=>{const p=page+1; setPage(p); loadList(p);}}>Next</button>
          </div>
        </aside>
      ) : (
        // ───────── 상세 화면 ─────────
        <main style={styles.rightFull}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <button style={styles.backBtn} onClick={backToList}>← 목록으로</button>
            {msg && <span style={{ fontSize:12, color: msg.startsWith("✅") ? "#16a34a" : "#b00020" }}>{msg}</span>}
          </div>

          <div style={{ display:"grid", gap:12 }}>
            <section style={styles.panel}>
              <div style={styles.panelHd}><b>🧍 개인 프로필</b></div>
              <div style={styles.panelBd}>
                <div style={styles.profileGrid}>
                  <div>이름</div><div>{name}</div>
                  <div>성별</div><div>{sex}</div>
                  <div>나이</div><div>{age} 세</div>
                  <div>키</div><div>{height} cm</div>
                  <div>체중</div><div>{weight} kg</div>
                  <div>BMI</div>
                  <div>
                    {bmi ?? "-"}{" "}
                    <span style={{
                      marginLeft:8,padding:"2px 8px",borderRadius:999,
                      fontSize:12,fontWeight:700,
                      background:`${bmiInfo.color}1a`,color:bmiInfo.color,
                      border:`1px solid ${bmiInfo.color}55`
                    }}>{bmiInfo.label}</span>
                  </div>
                </div>

                {/* ── 상단 버튼 제거: id/trace/status만 남김 ── */}
                <div style={styles.metaRow}>
                  <span>id: {cur.id}</span>
                  <span>trace_id: {cur.trace_id}</span>
                  <span>status: <span style={styles.statPill(status)}>{status || "-"}</span></span>
                </div>
              </div>
            </section>

            <section style={styles.panel}>
              <div style={{ ...styles.panelHd, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <b>맞춤 운동처방</b>
                <div style={{ display:"flex", gap:8 }}>
                  {!editMode ? (
                    <button style={styles.primaryBtn} onClick={()=>{setEditMode(true); setDraftCards(splitPlanMd(planMd || "").cardsMd || "");}}>수정</button>
                  ) : (
                    <button style={styles.btn} onClick={()=>{setEditMode(false); setDraftCards("");}}>수정 취소</button>
                  )}
                  <button style={styles.saveBtn} disabled={saving} onClick={handleSave}>{saving ? "저장 중…" : "검수완료"}</button>
                </div>
              </div>
              <div style={styles.panelBd}>
                {(editMode ? draftCards : splitPlanMd(planMd || "").cardsMd || planMd).trim()
                  ? (editMode
                      ? <PlanCardsInlineWysiwyg planMd={draftCards} onChange={setDraftCards} />
                      : <PlanCards planMd={splitPlanMd(planMd || "").cardsMd || planMd} />)
                  : <div style={{ color:"#64748b", fontSize:14 }}>plan_md가 비어 있습니다.</div>}
              </div>
            </section>

            {adviceMd && (
              <section style={styles.panel}>
                <div style={{ ...styles.panelHd, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <b>설문 기반 맞춤형 조언</b>
                  <button style={styles.btn} onClick={copyAdviceMdToClipboard}>조언 복사</button>
                </div>
                <div style={styles.panelBd}>
                  <ReactMarkdown>{adviceMd}</ReactMarkdown>
                  <div style={{ marginTop:10, padding:"8px 10px", fontSize:12, color:"#0369a1",
                                background:"#e0f2fe", border:"1px dashed #bae6fd", borderRadius:10 }}>
                    ※ 본 조언은 일반적 정보이며, 증상 발현 시 즉시 중단하고 전문가와 상담하세요.
                  </div>
                </div>
              </section>
            )}

            <details open style={styles.panel}>
              <summary style={styles.panelHd}><b>원본 JSON (요약)</b></summary>
              <div style={styles.panelBd}>
                <pre style={styles.jsonBox}>{JSON.stringify({
                  status: cur.status ?? "(없음)",
                  user: cur.user,
                  measurements: cur.measurements,
                  surveys: cur.surveys,
                  evidence: cur.evidence
                }, null, 2)}</pre>
              </div>
            </details>
          </div>
        </main>
      )}
    </div>
  );
}

/* ───────── styles ───────── */
const styles = {
  shell:{padding:"16px",maxWidth:1280,margin:"0 auto",fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,sans-serif",color:"#0f172a"},

  /* 좌측 리스트 카드 */
  leftFull:{
    background:"#fff",border:"1px solid rgba(15,23,42,.08)",borderRadius:14,padding:12,
    boxShadow:"0 18px 40px rgba(2,6,23,.06)"
  },

  /* 상단 툴바 */
  toolbar:{display:"flex",gap:10,marginBottom:10,alignItems:"center"},
  searchBox:{
    flex:1, display:"flex", alignItems:"center", gap:8,
    border:"1px solid #e5e7eb", borderRadius:12, padding:"8px 10px", background:"#f8fafc"
  },
  input:{flex:1, border:"none", outline:"none", background:"transparent", fontSize:14, color:"#0f172a"},

  /* 버튼 */
  btn:{border:"1px solid #cbd5e1",background:"#fff",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontWeight:700},
  btnGhost:{border:"1px solid #cbd5e1",background:"#fff",borderRadius:10,padding:"6px 10px",cursor:"pointer",fontWeight:700},
  primaryBtn:{border:"1px solid #0b5cab",background:"#0b5cab",color:"#fff",borderRadius:10,padding:"8px 12px",fontWeight:800},
  primaryBtnSm:{border:"1px solid #0b5cab",background:"#0b5cab",color:"#fff",borderRadius:10,padding:"8px 12px",fontWeight:800},
  backBtn:{border:"1px solid #94a3b8",background:"#f8fafc",borderRadius:10,padding:"8px 10px",cursor:"pointer",fontWeight:800},
  saveBtn:{border:"1px solid #16a34a",background:"#16a34a",color:"#fff",borderRadius:10,padding:"8px 12px",fontWeight:800},
  linkBtn:{border:"1px solid #cbd5e1",background:"#fff",borderRadius:10,padding:"6px 8px",cursor:"pointer",fontWeight:800,fontSize:12},

  /* 테이블 */
  tableWrap:{border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden"},
  table:{width:"100%", borderCollapse:"separate", borderSpacing:0},
  thead:{boxShadow:"0 1px 0 rgba(15,23,42,.06)"},
  th:{position:"sticky", top:0, background:"#fafafa", textAlign:"left", padding:"10px 12px",
      borderBottom:"1px solid #e5e7eb", fontSize:12, color:"#475569", zIndex:1},
  tr:{borderBottom:"1px solid #f1f5f9", transition:"background .12s"},
  td:{padding:"10px 12px",fontSize:14,verticalAlign:"middle"},
  tdMono:{padding:"10px 12px",fontSize:13,verticalAlign:"middle"},
  tdChip:{padding:"10px 12px",verticalAlign:"middle"},
  tdAct:{padding:"8px 12px", verticalAlign:"middle"},
  tdCenter:{
    padding:"10px 12px",
    fontSize:14,
    verticalAlign:"middle",
    textAlign:"center",
    lineHeight:0,           // ✅ 아이콘 베이스라인 영향 제거
  },


  /* 아이디 셀(말줄임 + 복사) */
  idCellWrap:{display:"flex", alignItems:"center", gap:8, minWidth:0},
  idCellCode:{
    display:"block", maxWidth:"100%", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
    background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 8px",
    fontFamily:"ui-monospace,Menlo,monospace", color:"#0b5cab"
  },
  copyMini:{
    border:"1px solid #cbd5e1", background:"#fff", borderRadius:8, padding:"4px 8px",
    cursor:"pointer", fontSize:12, fontWeight:800
  },

  /* 칩 */
  chip:{
    display:"inline-flex", alignItems:"center", justifyContent:"center",
    minWidth:28, height:24, padding:"0 8px",
    background:"#f1f5f9", border:"1px solid #e2e8f0", color:"#0f172a",
    borderRadius:999, fontSize:12, fontWeight:800
  },

  /* 완료/미완료 아이콘 컨테이너 (24x24) */
  statusOK:{
    display:"inline-flex",alignItems:"center",justifyContent:"center",
    width:24,height:24,borderRadius:"50%",background:"#ecfdf5",border:"1px solid #a7f3d0"
  },
  statusNA:{
    display:"inline-flex",alignItems:"center",justifyContent:"center",
    width:24,height:24,borderRadius:"50%",background:"#f8fafc",border:"1px solid #e2e8f0",
    color:"#94a3b8",fontWeight:800
  },

  /* 빈 상태 */
  empty:{padding:"28px 12px", textAlign:"center", color:"#0f172a", background:"#fff"},

  /* 페이저 */
  pager:{display:"flex", gap:8, justifyContent:"space-between", alignItems:"center", marginTop:10},
  pageInfo:{fontSize:12, color:"#475569"},

  /* 우측 상세 카드 */
  rightFull:{},
  panel:{background:"#fff",border:"1px solid rgba(15,23,42,.08)",borderRadius:12,overflow:"hidden",boxShadow:"0 18px 40px rgba(2,6,23,.06)"},
  panelHd:{padding:"12px 14px",background:"linear-gradient(180deg,#f8fafc,#ffffff)",borderBottom:"1px solid rgba(15,23,42,.06)"},
  panelBd:{padding:14},

  profileGrid:{display:"grid",gridTemplateColumns:"100px 1fr",gap:"8px 12px",fontSize:14},
  metaRow:{fontSize:12,color:"#94a3b8",marginTop:8,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"},
  statPill:(st)=>({
    textTransform:"lowercase",
    padding:"2px 8px",
    borderRadius:999,
    fontWeight:800,
    background: st==="complete" ? "#dcfce7" : "#f8fafc",
    color: st==="complete" ? "#166534" : "#475569",
    border: `1px solid ${st==="complete" ? "#bbf7d0" : "#e2e8f0"}`
  }),

  jsonBox:{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:12,fontSize:12,lineHeight:1.45,maxHeight:320,overflow:"auto",whiteSpace:"pre-wrap"},
};
