// src/pages/Results.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/AppState";
import { sendSessionSummary } from "../api/session";
import { useBuildSessionPayload } from "../api/buildSessionPayload";
import ReactMarkdown from "react-markdown"; // ✅ 조언 섹션 렌더용
import ManualEntryPanel from "../components/ManualEntryPanel";
import PlanCalendar from "../components/PlanCalendar.jsx";
import PlanCards from "../components/PlanCards.jsx";

// ───────────────────────── helpers ─────────────────────────
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

/** 🔎 서버에서 planMd에 다음 마커로 조언 블록이 붙어온다:
 *  "\n---\n### 설문 기반 ACSM6 조언(LLM)\n"
 *  → 이 마커로 split해서 카드/조언을 분리 렌더
 */
const ADVICE_MARK = "### 설문 기반 ACSM6 조언(LLM)";
function splitPlanMd(planMd = "") {
  if (!planMd) return { cardsMd: "", adviceMd: "" };
  const idx = planMd.indexOf(ADVICE_MARK);
  if (idx < 0) return { cardsMd: planMd, adviceMd: "" };
  return {
    cardsMd: planMd.slice(0, idx).trim(),
    adviceMd: planMd.slice(idx).trim(), // ADVICE_MARK 포함
  };
}

export default function Results() {
  const { session, setResultFromServer } = useApp();
  const payload = useBuildSessionPayload();

  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  // ▼ 캘린더 컨트롤 상태 (4~6주/시작일)
  const [weeksCal, setWeeksCal] = useState(4);
  const [startDateCal, setStartDateCal] = useState(null);

  // ▼ 처방 화면 표시 여부 (초기엔 false)
  const [showRx, setShowRx] = useState(false);
  useEffect(() => {
    if (session?.planMd) setShowRx(true);
  }, [session?.planMd]);

  // ───── 표시값 매핑
  const user = payload?.user ?? {};
  const m = payload?.measurements ?? {};
  const name = user?.name || "-";
  const sex = user?.sex || "-";
  const age = user?.age ?? "-";
  const height = user?.height_cm ?? "-";
  const weight = user?.weight_kg ?? "-";
  const bmi = calcBMI(weight, height);
  const bmiInfo = bmiBadge(bmi);

  const situp = (m?.situp_reps ?? session?.situp?.reps) ?? 0;
  const reach = (m?.reach_cm ?? session?.reach?.cm) ?? 0;
  const step_bpm = (m?.step_bpm ?? session?.step?.bpm) ?? 0;
  const vo2 = (m?.vo2max ?? session?.step?.vo2max) ?? 0;

  const scoreSitup = normalize(Number(situp), 10, 50);
  const scoreReach = normalize(Number(reach), -5, 12);
  const scoreStep  = normalize(Number(step_bpm), 120, 80, true);
  const scoreVo2   = normalize(Number(vo2), 30, 55);

  async function handleSend() {
    if (!session?.readyToSend) return;
    if (!payload?.user) {
      setErrorMsg("사용자 정보가 부족합니다. 프로필을 먼저 채워주세요.");
      return;
    }

    setLoading(true); setErrorMsg(null);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const { planMd, traceId } = await sendSessionSummary({
        ...payload,
        signal: abortRef.current.signal,
      });

      if (!planMd) {
        setErrorMsg("서버 응답에 planMd가 없습니다.");
      } else {
        setResultFromServer({ traceId: traceId || "", planMd });
        setShowRx(true);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setErrorMsg(err.message || "요청 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  function handlePrint() { window.print(); }
  async function copyPlanMd() {
    try { await navigator.clipboard.writeText(session?.planMd || ""); } catch {}
  }
  async function copyAdviceMd(adviceMd) {
    try { await navigator.clipboard.writeText(adviceMd || ""); } catch {}
  }

  const hasPlan = !!session?.planMd;
  const { cardsMd, adviceMd } = splitPlanMd(session?.planMd || "");

  return (
    <div style={styles.container}>
      {!showRx && (
        <div style={{ position: "relative" }}>
          {/* 1) 입력 카드 */}
          <ManualEntryPanel />
          {/* 2) CTA */}
          <div style={styles.ctaRow}>
            <button
              style={{
                ...(session?.readyToSend ? styles.primaryBtnBlue : styles.primaryBtnDisabled),
                ...styles.ctaButton,
                opacity: loading ? .6 : 1,
              }}
              disabled={!session?.readyToSend || loading}
              onClick={handleSend}
              title="유사사례/ACSM 근거 기반 처방 생성"
            >
              {loading ? "처방 생성 중…" : "운동처방 받기"}
            </button>
          </div>
        </div>
      )}

      {showRx && (
        <>
          <div style={styles.rxCard}>
            {/* 헤더 */}
            <div style={styles.rxHeader}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>운동 처방전</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  AI Fitness • {new Date().toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button style={styles.ghostBtn} onClick={handlePrint}>인쇄/PDF</button>
              </div>
            </div>

            {/* 상단 요약 */}
            <div style={styles.topGrid}>
              {/* 프로필 */}
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

              {/* 측정 결과 */}
              <section style={styles.panel}>
                <div style={styles.panelTitle}>⚙️ 측정 결과</div>
                <Row name="윗몸 말아올리기" value={situp} unit="회" score={scoreSitup} />
                <Row name="좌전굴" value={reach} unit="cm" score={scoreReach} />
                <Row name="스텝 회복기" value={step_bpm} unit="BPM" score={scoreStep} />
                <Row name="추정 VO₂max" value={vo2} unit="ml/kg/min" score={scoreVo2} />
                {session?.traceId && !loading && (
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                    trace_id: {session.traceId}
                  </div>
                )}
              </section>
            </div>

            {/* ▼ 맞춤 운동처방 (카드) */}
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

              {errorMsg ? (
                <div style={styles.errorBox}>
                  서버 오류: {errorMsg}
                  <button style={styles.retryBtn} onClick={handleSend} disabled={loading}>다시 시도</button>
                </div>
              ) : (
                <div style={styles.planBody}>
                  {hasPlan ? (
                    <>
                      {typeof PlanCards === "function" ? (
                        <PlanCards planMd={cardsMd || session.planMd} />
                      ) : null}
                    </>
                  ) : (
                    <div style={{ color: "#64748b", fontSize: 14 }}>
                      아직 처방이 생성되지 않았습니다. 상단의 <b>운동처방 받기</b>를 눌러주세요.
                    </div>
                  )}
                </div>
              )}

              <div style={styles.footer}>
                <div>담당 코치: <b>AI Fitness Coach</b></div>
                <div style={{ borderTop: "1px dashed #e2e8f0", marginTop: 8, paddingTop: 8, fontSize: 12, color: "#64748b" }}>
                  이 처방은 안내용이며 개인의 건강 상태에 따라 조정이 필요할 수 있습니다.
                </div>
              </div>
            </section>

            {/* ▼ NEW: 설문 기반 ACSM6 조언 패널 */}
            {hasPlan && adviceMd && (
              <section style={styles.advicePanel}>
                <div style={styles.adviceHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ ...styles.planDot, background:"#0ea5e9", boxShadow:"0 0 0 3px #38bdf833" }} />
                    <h3 style={{ margin: 0, fontSize: 18 }}>설문 기반 맞춤형 조언</h3>
                  </div>
                  <div>
                    <button
                      style={styles.ghostBtn}
                      onClick={() => copyAdviceMd(adviceMd)}
                      title="조언 마크다운 복사"
                    >
                      조언 복사
                    </button>
                  </div>
                </div>

                <div style={styles.adviceBody}>
                  <ReactMarkdown
                    components={{
                      h3: ({node, ...props}) => <h3 style={{margin:"14px 0 6px"}} {...props} />,
                      h4: ({node, ...props}) => <h4 style={{margin:"10px 0 4px"}} {...props} />,
                      li: ({node, ...props}) => <li style={{margin:"4px 0"}} {...props} />,
                      code: ({node, inline, ...props}) =>
                        inline ? <code style={{background:"#f8fafc", padding:"2px 6px", borderRadius:6}} {...props} /> :
                        <pre style={{background:"#0f172a", color:"#e2e8f0", padding:12, borderRadius:10, overflow:"auto"}}><code {...props} /></pre>
                    }}
                  >
                    {adviceMd}
                  </ReactMarkdown>

                  <div style={styles.noticeLine}>
                    ※ 본 조언은 일반적 정보이며, 증상 발현 시 즉시 중단하고 전문가와 상담하세요.
                  </div>
                </div>
              </section>
            )}

            {/* ▼ 캘린더 섹션 */}
            {hasPlan && (
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
                  {typeof PlanCalendar === "function" ? (
                    <PlanCalendar
                      planMd={session.planMd}
                      weeks={weeksCal}
                      startDate={startDateCal || undefined}
                    />
                  ) : (
                    <div style={{ color: "#64748b", fontSize: 14 }}>
                      PlanCalendar 컴포넌트를 사용할 수 없습니다.
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── styles ─────────────────────────
const styles = {
  container: {
    maxWidth: 960,
    margin: "24px auto",
    padding: "16px",
    fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    color: "#0f172a",
  },

  ctaRow: {
    position: "absolute",
    bottom: 47,
    right: 16,
    display: "flex",
    alignItems: "center",
  },
  ctaButton: { minWidth: 220, borderRadius: 10 },

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
  primaryBtnDisabled: {
    padding: "10px 25px",
    borderRadius: 10,
    border: "5px solid #cbd5e1",
    background: "#f1f5f9",
    color: "#94a3b8",
    fontWeight: 700,
    fontSize: 14,
    cursor: "not-allowed",
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
  retryBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #b00020",
    background: "#fff",
    cursor: "pointer",
  },

  // NEW: 조언 패널
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
