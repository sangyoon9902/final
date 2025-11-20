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
function normalize(v, min, max, invert = false) {
  if (v == null || isNaN(v)) return 0;
  const x = Math.max(min, Math.min(max, v));
  const r = (x - min) / (max - min);
  return Math.round((invert ? 1 - r : r) * 100);
}
function bmiBadge(bmi) {
  if (bmi == null) return { label: "-", color: "#64748b" };
  if (bmi < 18.5) return { label: "저체중", color: "#3b82f6" };
  if (bmi < 23)   return { label: "정상",   color: "#16a34a" };
  if (bmi < 25)   return { label: "과체중", color: "#f59e0b" };
  return { label: "비만", color: "#ef4444" };
}
function grade(score) {
  if (score >= 80) return { label: "우수", color: "#16a34a" };
  if (score >= 60) return { label: "보통", color: "#3b82f6" };
  if (score >= 40) return { label: "주의", color: "#f59e0b" };
  return { label: "개선필요", color: "#ef4444" };
}
function Bar({ score, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 10, borderRadius: 8,
        background: "linear-gradient(90deg,#ef4444 0%,#f59e0b 40%,#60a5fa 60%,#16a34a 100%)",
        position: "relative", overflow: "hidden"
      }}>
        <div style={{
          position: "absolute", inset: 0, width: `${score}%`,
          background: "rgba(255,255,255,.85)", mixBlendMode: "overlay"
        }} />
      </div>
      <div style={{ width: 64, textAlign: "right", fontSize: 12 }}>{right}</div>
    </div>
  );
}
function Row({ name, value, unit, score }) {
  const g = grade(score);
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "140px 1fr 80px",
      gap: 12, alignItems: "center",
      padding: "10px 0",
      borderBottom: "1px solid rgba(15,23,42,.06)"
    }}>
      <div style={{ fontWeight: 600 }}>{name}</div>
      <Bar score={score} right={<b style={{ color: g.color }}>{g.label}</b>} />
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {value ?? "-"} {unit}
      </div>
    </div>
  );
}

/** 🔎 planMd 분리 규칙 */
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

// 🔐 정책: 검수 완료만 노출 (final 기준, 과거 complete 임시 허용)
const REQUIRE_APPROVED = true;
function isApprovedLike(row) {
  const st = String(row?.status || "").toLowerCase();
  return st === "final" || st === "complete" || row?.approved === true;
}

export default function MyResult() {
  const [searchKey, setSearchKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");

  const [weeksCal, setWeeksCal] = useState(4);
  const [startDateCal, setStartDateCal] = useState(null);
  const [showRx, setShowRx] = useState(false);
  useEffect(() => { setShowRx(!!detail); }, [detail]);

  // 초기 검색키: 로컬 유저
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai_fitness_user");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.userId) setSearchKey(parsed.userId);
      if (parsed?.id && !parsed.userId) setSearchKey(parsed.id);
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
      let data = await listResults({ page: 1, size: 50, q: key });
      let list = Array.isArray(data?.items) ? data.items.slice() : [];
      if (REQUIRE_APPROVED) list = list.filter(isApprovedLike);
      list.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

      if (!list.length) {
        try {
          const full = await getResult(key);
          if (REQUIRE_APPROVED && !isApprovedLike(full)) {
            setItems([]); setDetail(null);
            setErr("검수 완료(final) 결과가 아닙니다.");
            return;
          }
          setItems([full]); setDetail(full);
        } catch {
          setItems([]); setDetail(null);
          setErr("검수 완료된 결과가 없습니다. (final 상태만 조회됩니다)");
        } finally { setLoading(false); }
        return;
      }

      const exact = list.find(r => r.id === key || r.trace_id === key);
      const targetId = (exact ? exact.id : list[0].id);
      const full = await getResult(targetId);
      if (REQUIRE_APPROVED && !isApprovedLike(full)) {
        setDetail(null);
        setErr("이 결과는 아직 검수 완료(final)가 아닙니다.");
        setItems(list); setLoading(false); return;
      }
      setItems(list); setDetail(full);
    } catch (e) {
      setErr("조회 실패: " + (e.message || "unknown"));
      setItems([]); setDetail(null);
    } finally { setLoading(false); }
  }

  const planMdRaw = ((detail?.planMd ?? detail?.plan_md) || "") + "";
  const { cardsMd, adviceMd } = splitPlanMd(planMdRaw || "");

  const user = detail?.user ?? {};
  const name = user?.name || "-";
  const sex = user?.sex || "-";
  const age = user?.age ?? "-";
  const height = user?.height_cm ?? "-";
  const weight = user?.weight_kg ?? "-";
  const bmi = calcBMI(weight, height);
  const bmiInfo = bmiBadge(bmi);

  const m = detail?.measurements || detail?.payload?.measurements || detail?.payload?.m || {};
  const situp = (m?.situp_reps ?? detail?.situp_reps) ?? 0;
  const reach = (m?.reach_cm ?? detail?.reach_cm) ?? 0;
  const step_bpm = (m?.step_bpm ?? detail?.step_bpm) ?? 0;
  const vo2 = (m?.vo2max ?? detail?.vo2max) ?? 0;

  const scoreSitup = normalize(Number(situp), 10, 50);
  const scoreReach = normalize(Number(reach), -5, 12);
  const scoreStep  = normalize(Number(step_bpm), 120, 80, true);
  const scoreVo2   = normalize(Number(vo2), 30, 55);

  async function copyPlanMd() { try { await navigator.clipboard.writeText(planMdRaw || ""); } catch {} }
  async function copyAdviceMd() { try { await navigator.clipboard.writeText(adviceMd || ""); } catch {} }
  function handlePrint() { window.print(); }

  const hasPlan = !!planMdRaw;

  return (
    <div style={styles.container}>
      {/* 검색 카드 */}
      <div className="card" style={{ ...styles.rxCard, marginBottom: 16 }}>
        <div style={{ display:"flex", gap: 8, alignItems:"center", flexWrap:"wrap" }}>
          <input
            value={searchKey}
            onChange={(e)=>setSearchKey(e.target.value)}
            placeholder="예) 1570bb49-...  또는  usr_1234abcd"
            style={{ flex:1, border:"1px solid #cbd5e1", borderRadius:10, padding:"10px 12px", height:44 }}
            onKeyDown={(e)=>{ if(e.key === "Enter") doSearch(); }}
          />
          <button
            style={styles.primaryBtnBlue}
            onClick={()=>doSearch()}
            disabled={loading}
            title="검수 완료된 결과 검색"
          >
            {loading ? "검색 중…" : "검색"}
          </button>
        </div>
        {err && <div style={{ ...styles.errorBox, marginTop: 12 }}>{err}</div>}
      </div>

      {/* 결과 카드 */}
      {hasPlan && (
        <div style={styles.rxCard}>
          {/* 헤더 */}
          <div style={styles.rxHeader}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>운동 처방전</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                AI Fitness • {new Date(detail?.created_at || Date.now()).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={{ fontSize:12, color:"#64748b" }}>id: <b>{detail?.id}</b></span>
              <span style={{ fontSize:12, color:"#64748b" }}>trace_id: <b>{detail?.trace_id}</b></span>
              <button style={styles.ghostBtn} onClick={handlePrint}>인쇄/PDF</button>
            </div>
          </div>

          {/* 상단 요약 */}
          <div style={styles.topGrid}>
            {/* 프로필 패널 */}
            <section style={styles.panel}>
              <div style={styles.panelTitle}>🧍 개인 프로필</div>
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
            </section>

            {/* 측정 결과 패널 */}
            <section style={styles.panel}>
              <div style={styles.panelTitle}>⚙️ 측정 결과</div>
              <Row name="윗몸 말아올리기" value={situp} unit="회"        score={scoreSitup} />
              <Row name="앉아 윗몸 앞으로 굽히기"       value={reach} unit="cm"        score={scoreReach} />
              <Row name="스텝 회복기"  value={step_bpm} unit="BPM"    score={scoreStep} />
              <Row name="추정 VO₂max"  value={vo2} unit="ml/kg/min"   score={scoreVo2} />
              {detail?.trace_id && (
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                  trace_id: {detail.trace_id}
                </div>
              )}
            </section>
          </div>

          {/* 맞춤 운동처방 */}
          <section style={styles.planPanel}>
            <div style={styles.planHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={styles.planDot} />
                <h3 style={{ margin: 0, fontSize: 18 }}>맞춤 운동처방</h3>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={styles.legendItem}><i style={{ ...styles.dot, background:"#16a34a"}} /> 우수</span>
                <span style={styles.legendItem}><i style={{ ...styles.dot, background:"#3b82f6"}} /> 보통</span>
                <span style={styles.legendItem}><i style={{ ...styles.dot, background:"#f59e0b"}} /> 주의</span>
                <span style={styles.legendItem}><i style={{ ...styles.dot, background:"#ef4444"}} /> 개선필요</span>
                {hasPlan && (
                  <button style={styles.ghostBtn} onClick={copyPlanMd} title="생성된 처방 마크다운 복사">처방 복사</button>
                )}
              </div>
            </div>

            <div style={styles.planBody}>
              <PlanCards planMd={cardsMd || planMdRaw} />
            </div>

            <div style={styles.footer}>
              <div>담당 코치: <b>AI Fitness Coach</b></div>
              <div style={{ borderTop: "1px dashed #e2e8f0", marginTop: 8, paddingTop: 8, fontSize: 12, color: "#64748b" }}>
                이 처방은 안내용이며 개인의 건강 상태에 따라 조정이 필요할 수 있습니다.
              </div>
            </div>
          </section>

          {/* 설문 기반 조언 */}
          {adviceMd && (
            <section style={styles.advicePanel}>
              <div style={styles.adviceHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ ...styles.planDot, background:"#0ea5e9", boxShadow:"0 0 0 3px #38bdf833" }} />
                  <h3 style={{ margin: 0, fontSize: 18 }}>설문 기반 맞춤형 조언</h3>
                </div>
                <div>
                  <button style={styles.ghostBtn} onClick={copyAdviceMd} title="조언 마크다운 복사">조언 복사</button>
                </div>
              </div>
              <div style={styles.adviceBody}>
                <ReactMarkdown>{adviceMd}</ReactMarkdown>
                <div style={styles.noticeLine}>
                  ※ 본 조언은 일반적 정보이며, 증상 발현 시 즉시 중단하고 전문가와 상담하세요.
                </div>
              </div>
            </section>
          )}

          {/* 캘린더 */}
          <section style={styles.planPanel}>
            <div style={styles.planHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={styles.planDot} />
                <h3 style={{ margin: 0, fontSize: 18 }}>주간 계획표 (캘린더)</h3>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  style={{ ...styles.ghostBtn, boxShadow: weeksCal===4 ? "inset 0 0 0 1px #cbd5e1" : "none" }}
                  onClick={() => setWeeksCal(4)}
                >4주</button>
                <button
                  style={{ ...styles.ghostBtn, boxShadow: weeksCal===6 ? "inset 0 0 0 1px #cbd5e1" : "none" }}
                  onClick={() => setWeeksCal(6)}
                >6주</button>
                <input
                  type="date"
                  style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px" }}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDateCal(v ? new Date(v + "T09:00:00") : null);
                  }}
                />
              </div>
            </div>
            <div style={{ padding: 12 }}>
              <PlanCalendar
                planMd={planMdRaw}
                weeks={weeksCal}
                startDate={startDateCal || undefined}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ───────── styles ───────── */
const styles = {
  container: {
    maxWidth: 960,
    margin: "24px auto",
    padding: "16px",
    fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    color: "#0f172a",
  },

  rxCard: {
    background: "#ffffff",
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,.08)",
    boxShadow: "0 18px 40px rgba(2,6,23,.06)",
    padding: 20,
    marginBottom: 16,
  },
  rxHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    paddingBottom: 10, borderBottom: "1px solid rgba(15,23,42,.06)", marginBottom: 10,
  },

  primaryBtnBlue: {
    padding: "10px 25px",
    borderRadius: 10,
    border: "5px solid #0b5cab",
    background: "#0b5cab",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
  },
  ghostBtn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },

  topGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1.4fr",
    gap: 12,
    marginTop: 12,
  },
  panel: {
    background: "#fafafa",
    border: "1px solid rgba(15,23,42,.06)",
    borderRadius: 12,
    padding: 14,
  },
  panelTitle: { fontWeight: 800, marginBottom: 8, fontSize: 15 },
  profileGrid: {
    display: "grid",
    gridTemplateColumns: "100px 1fr",
    rowGap: 8, columnGap: 12, fontSize: 14,
  },

  planPanel: {
    marginTop: 14,
    background: "#fff",
    border: "1px solid rgba(15,23,42,.06)",
    borderRadius: 12,
    overflow: "hidden",
  },
  planHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "linear-gradient(180deg,#f8fafc,#ffffff)",
    borderBottom: "1px solid rgba(15,23,42,.06)",
  },
  planDot: {
    width: 10, height: 10, borderRadius: 999, background: "#16a34a",
    boxShadow: "0 0 0 3px #22c55e33",
  },
  legendItem: { fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6 },
  dot: { display: "inline-block", width: 10, height: 10, borderRadius: 999 },
  planBody: { padding: 16 },
  footer: { padding: "0 16px 14px" },

  errorBox: {
    background: "#ffe5e5",
    border: "1px solid #ff9f9f",
    borderRadius: 10,
    padding: 12,
    color: "#b00020",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  advicePanel: {
    marginTop: 14,
    background: "#ffffff",
    border: "1px solid rgba(2,6,23,.08)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(2,6,23,.05)",
  },
  adviceHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "linear-gradient(180deg,#f0f9ff,#ffffff)",
    borderBottom: "1px solid rgba(2,6,23,.06)",
  },
  adviceBody: {
    padding: 16,
    color: "#0f172a",
  },
  noticeLine: {
    marginTop: 10,
    padding: "8px 10px",
    fontSize: 12,
    color: "#0369a1",
    background: "#e0f2fe",
    border: "1px dashed #bae6fd",
    borderRadius: 10,
  },
};
