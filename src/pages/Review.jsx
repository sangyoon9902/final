// src/pages/Review.jsx
import React, { useEffect, useState, useCallback } from "react";
import { listResults, getResult, patchResult } from "../api/review.js";
import PlanCards from "../components/PlanCards.jsx";
import PlanCardsInlineWysiwyg from "../components/PlanCardsInlineWysiwyg.jsx";

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

export default function Review() {
  // 좌측 리스트
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size] = useState(50);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // 우측 상세
  const [cur, setCur] = useState(null);
  const [planMd, setPlanMd] = useState("");   // 조회한 원문(미리보기용)
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 인라인 카드 편집 상태
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState("");     // 인라인에서 조립되는 최신 md

  // 리스트 로드
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

  // 상세 로드
  async function openRow(row) {
    try {
      const data = await getResult(row.id || row.trace_id);
      setCur(data);
      // ✅ 응답이 planMd 또는 plan_md 어느 쪽이든 수용
      const pm = (data?.planMd ?? data?.plan_md ?? "") + "";
      setPlanMd(pm);
      setDraft(pm);           // 편집 시작 시 초기값
      setStatus(data?.status ?? "");
      setEditMode(false);
      setMsg("");
    } catch (e) {
      setMsg(e.message || "상세 조회 실패");
    }
  }

  // 표시값
  const user = cur?.user ?? {};
  const name = user?.name || "-";
  const sex = user?.sex || "-";
  const age = user?.age ?? "-";
  const height = user?.height_cm ?? "-";
  const weight = user?.weight_kg ?? "-";
  const bmi = calcBMI(weight, height);
  const bmiInfo = bmiBadge(bmi);

  // 저장
  const handleSave = useCallback(async () => {
    if (!cur?.id) return;
    setSaving(true); setMsg("");
    try {
      const bodyPlan = editMode ? draft : planMd;
      // ✅ camelCase로 전달(내부에서 snake도 동시 포함)
      await patchResult(cur.id, { planMd: bodyPlan, status });

      setMsg("✅ 저장되었습니다.");
      // 최신값 재조회
      const data = await getResult(cur.id);
      const pm = (data?.planMd ?? data?.plan_md ?? "") + "";
      setCur(data);
      setPlanMd(pm);
      setDraft(pm);
      setStatus(data?.status ?? "");
      setEditMode(false); // 저장 후 미리보기로
    } catch (e) {
      setMsg("❌ 저장 실패: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }, [cur?.id, editMode, draft, planMd, status]);

  // 단축키: E(편집 토글), ⌘/Ctrl+S(저장)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
      if (e.key.toLowerCase() === "e") {
        setEditMode(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div style={styles.page}>
      {/* 좌측: 리스트 */}
      <aside style={styles.left}>
        <div style={styles.toolbar}>
          <input
            placeholder="이름/성별/나이/JSON 검색"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={(e)=>{ if(e.key==="Enter") loadList(1); }}
            style={styles.input}
            aria-label="검색어"
          />
          <button style={styles.btn} onClick={()=>loadList(1)} aria-label="검색">검색</button>
        </div>

        <div style={styles.listBox} aria-busy={loadingList}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={styles.th}>id</th>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>성별</th>
                <th style={styles.th}>나이</th>
                <th style={styles.th} />
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr><td style={styles.td} colSpan={5}>로딩 중…</td></tr>
              ) : items.length ? items.map((r) => (
                <tr key={r.id} style={styles.tr}>
                  <td style={styles.tdMono}>{r.id}</td>
                  <td style={styles.td}>{r.name}</td>
                  <td style={styles.td}>{r.sex}</td>
                  <td style={styles.td}>{r.age}</td>
                  <td style={styles.td}>
                    <button style={styles.linkBtn} onClick={()=>openRow(r)}>열기</button>
                  </td>
                </tr>
              )) : (
                <tr><td style={styles.td} colSpan={5}><i>결과 없음</i></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 8 }}>
          <button
            style={styles.btn}
            disabled={page<=1}
            onClick={()=>{const p=page-1; setPage(p); loadList(p);}}
            aria-label="이전 페이지"
          >Prev</button>
          <div style={{ fontSize:12, color:"#64748b" }}>
            Page {page} / {totalPages} (총 {total}건)
          </div>
          <button
            style={styles.btn}
            disabled={page>=totalPages}
            onClick={()=>{const p=page+1; setPage(p); loadList(p);}}
            aria-label="다음 페이지"
          >Next</button>
        </div>
      </aside>

      {/* 우측: 상세 + 편집 */}
      <main style={styles.right}>
        {!cur ? (
          <div style={{ color:"#64748b" }}>왼쪽 목록에서 항목을 선택하세요.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {/* 상단 요약 */}
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
                      marginLeft: 8, padding: "2px 8px", borderRadius: 999,
                      fontSize: 12, fontWeight: 700,
                      background: `${bmiInfo.color}1a`, color: bmiInfo.color,
                      border: `1px solid ${bmiInfo.color}55`
                    }}>
                      {bmiInfo.label}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize:12, color:"#94a3b8", marginTop:8, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span>id: {cur.id}</span>
                  <span>trace_id: {cur.trace_id}</span>
                  <span>status:</span>
                  <select value={status} onChange={(e)=>setStatus(e.target.value)} style={styles.sel} aria-label="상태">
                    <option value="">(none)</option>
                    <option value="draft">draft</option>
                    <option value="review">review</option>
                    <option value="final">final</option>
                  </select>

                  <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                    {!editMode ? (
                      <button
                        style={styles.primaryBtn}
                        onClick={()=>{ setEditMode(true); setDraft(planMd || ""); }}
                        title="카드에서 직접 수정 (클릭-편집)"
                      >
                        카드 편집
                      </button>
                    ) : (
                      <button
                        style={styles.btn}
                        onClick={()=>{ setEditMode(false); setDraft(planMd || ""); }}
                        title="인라인 편집 취소"
                      >
                        편집 취소
                      </button>
                    )}
                    <button
                      style={styles.saveBtn}
                      disabled={saving}
                      onClick={handleSave}
                      title="DB에 저장"
                    >
                      {saving ? "저장 중…" : "저장"}
                    </button>
                    {msg && <span style={{ fontSize:12, color: msg.startsWith("✅") ? "#16a34a" : "#b00020" }}>{msg}</span>}
                  </div>
                </div>
              </div>
            </section>

            {/* 미리보기 = 편집 본문 */}
            <section style={styles.panel}>
              <div style={{ ...styles.panelHd, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <b>맞춤 운동처방</b>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  {editMode && (
                    <span style={{
                      fontSize:12, fontWeight:800, color:"#0b5cab",
                      background:"#e6f0ff", border:"1px solid #bfd6ff",
                      borderRadius:999, padding:"4px 8px"
                    }}>편집 중</span>
                  )}
                  {!editMode ? (
                    <button
                      style={styles.primaryBtn}
                      onClick={()=>{ setEditMode(true); setDraft(planMd || ""); }}
                      title="카드에서 직접 수정 (클릭-편집) | 단축키: E"
                    >카드 편집</button>
                  ) : (
                    <button
                      style={styles.btn}
                      onClick={()=>{ setEditMode(false); setDraft(planMd || ""); }}
                      title="인라인 편집 취소"
                    >편집 취소</button>
                  )}
                  <button
                    style={styles.saveBtn}
                    disabled={saving}
                    onClick={handleSave}
                    title="DB에 저장 | 단축키: ⌘/Ctrl+S"
                  >{saving ? "저장 중…" : "저장"}</button>
                </div>
              </div>

              <div style={styles.panelBd}>
                {((editMode ? draft : planMd) || "").trim()
                  ? (
                      editMode
                        ? <PlanCardsInlineWysiwyg planMd={draft} onChange={setDraft} />
                        : <PlanCards planMd={planMd} />
                    )
                  : <div style={{ color:"#64748b", fontSize:14 }}>plan_md가 비어 있습니다.</div>}
              </div>
            </section>

            {/* 원본 JSON 요약 */}
            <details open style={styles.panel}>
              <summary style={styles.panelHd}><b>원본 JSON (요약)</b></summary>
              <div style={styles.panelBd}>
                <pre style={styles.jsonBox}>{JSON.stringify(
                  { user:cur.user, measurements:cur.measurements, surveys:cur.surveys, evidence:cur.evidence },
                  null, 2
                )}</pre>
              </div>
            </details>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { display:"grid", gridTemplateColumns:"420px 1fr", gap:12, padding:"16px", maxWidth:1280, margin:"0 auto",
          fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,sans-serif", color:"#0f172a" },
  left: { background:"#fff", border:"1px solid rgba(15,23,42,.08)", borderRadius:12, padding:12, boxShadow:"0 18px 40px rgba(2,6,23,.06)" },
  right:{},
  toolbar:{ display:"flex", gap:8, marginBottom:8 },
  input:{ flex:1, border:"1px solid #e5e7eb", borderRadius:10, padding:"8px 10px" },
  btn:{ border:"1px solid #cbd5e1", background:"#fff", borderRadius:10, padding:"8px 10px", cursor:"pointer", fontWeight:700 },
  primaryBtn:{ border:"1px solid #0b5cab", background:"#0b5cab", color:"#fff", borderRadius:10, padding:"8px 12px", fontWeight:800 },
  saveBtn:{ border:"1px solid #16a34a", background:"#16a34a", color:"#fff", borderRadius:10, padding:"8px 12px", fontWeight:800 },
  listBox:{ maxHeight:"60vh", overflow:"auto", border:"1px solid #e5e7eb", borderRadius:8 },
  th:{ position:"sticky", top:0, background:"#fafafa", textAlign:"left", padding:8, borderBottom:"1px solid #e5e7eb", fontSize:12, color:"#475569", zIndex:1 },
  tr:{ borderBottom:"1px solid #f1f5f9" },
  td:{ padding:8, fontSize:14, verticalAlign:"top" },
  tdMono:{ padding:8, fontSize:13, fontFamily:"ui-monospace,Menlo,monospace", wordBreak:"break-all" },
  linkBtn:{ border:"1px solid #cbd5e1", background:"#fff", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontWeight:700 },
  panel:{ background:"#fff", border:"1px solid rgba(15,23,42,.08)", borderRadius:12, overflow:"hidden", boxShadow:"0 18px 40px rgba(2,6,23,.06)" },
  panelHd:{ padding:"12px 14px", background:"linear-gradient(180deg,#f8fafc,#ffffff)", borderBottom:"1px solid rgba(15,23,42,.06)" },
  panelBd:{ padding:14 },
  profileGrid:{ display:"grid", gridTemplateColumns:"100px 1fr", gap:"8px 12px", fontSize:14 },
  sel:{ padding:"4px 6px", border:"1px solid #cbd5e1", borderRadius:8, fontSize:12 },
  jsonBox:{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:12, fontSize:12, lineHeight:1.45, maxHeight:320, overflow:"auto", whiteSpace:"pre-wrap" },
};
