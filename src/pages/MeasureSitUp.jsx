// src/pages/MeasureSitup.jsx
import { useEffect, useRef, useState, useLayoutEffect } from "react";

import { useNavigate } from "react-router-dom";

// 1) 로직/상태 훅
import { usePoseCamera } from "../hooks/usePoseCamera";
import { useApp } from "../state/AppState";
import { updateSitupCountByBodyAngle, resetSitupCounterByBodyAngle } from "../logic/situpCounterByBodyAngle";

// 2) 유틸/로직 함수
import { estimateYawDeg, angleOKForTest } from "../logic/framing";
import { IDX, VIS_TH, SIT_SIDE_MIN } from "../utils/poseIdx";
import { angleDeg } from "../utils/math";

/* ───────────────────────── 공통 유틸: 값 변화시에만 setState ───────────────────────── */
function setIfChanged(setter, ref, next) {
  const bothNaN = Number.isNaN(ref.current) && Number.isNaN(next);
  if (bothNaN) return;
  if (ref.current !== next) {
    ref.current = next;
    setter(next);
  }
}

/* ───────────────────────── 1. FlowRibbon UI ───────────────────────── */
const steps = [
  { id: "guide",      label: "자세 안내" },
  { id: "countdown",  label: "카운트다운" },
  { id: "running",    label: "측정 중" },
  { id: "finished",   label: "측정 완료" },
];

function SitupFlowRibbon({ phase, countdown }) {
  const currentId =
    phase === "guide"     ? "guide" :
    phase === "countdown" ? "countdown" :
    phase === "running"   ? "running" :
    phase === "finished"  ? "finished" : "guide";

  const indexOf = (id) => steps.findIndex(s => s.id === id);
  const currentIdx = Math.max(0, indexOf(currentId));

  const rightText =
    phase === "guide"     ? "카메라에 자세를 맞춰주세요" :
    phase === "countdown" ? `곧 시작: ${countdown}` :
    phase === "running"   ? "측정 중... (움직임이 없으면 4초 후 자동 종료)" :
    phase === "finished"  ? "측정 완료 ✅" : "";

  // ✅ DOM 측정용 refs
  const trackRef = useRef(null);
  const stepRefs = useRef([]);   // 각 점 컨테이너 ref
  const [fillPx, setFillPx] = useState(0);

  // ✅ 점의 '중심'까지 정확히 채우기
  useLayoutEffect(() => {
    function measure() {
      const trackRect = trackRef.current?.getBoundingClientRect?.();
      const dotRect = stepRefs.current[currentIdx]?.getBoundingClientRect?.();
      if (!trackRect || !dotRect) return;

      // 점 중심
      const centerX = dotRect.left + dotRect.width / 2;
      // 좌측 패딩(left: 8px)을 고려한 실제 채움 너비(px)
      const width = Math.max(0, Math.min(trackRect.width, centerX - trackRect.left));
      setFillPx(width);
    }
    measure();

    // 반응형 대응
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [currentIdx]);

  return (
    <div>
      <div style={{
        position: "relative",
        borderRadius: 14,
        padding: "14px 18px",
        background: "linear-gradient(180deg, rgba(18,18,22,0.95), rgba(10,10,12,0.9))",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)"
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:10 }}>
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:0.2, color:"#eaeefb" }}>
            윗몸일으키기 측정
          </span>
          <span style={{ fontSize:12, opacity:0.85 }}>{rightText}</span>
        </div>

        <div ref={trackRef} style={{ position:"relative", padding:"10px 0 4px" }}>
          {/* 베이스 라인 */}
          <div style={{
            position:"absolute", left:8, right:8, top:"50%", height:4, transform:"translateY(-50%)",
            background:"rgba(255,255,255,0.08)", borderRadius:4
          }} />
          {/* ✅ 채움 라인: 점 중심까지 정확히 */}
          <div style={{
            position:"absolute", left:8, top:"50%", height:4, transform:"translateY(-50%)",
            width: `${Math.max(0, fillPx - 8)}px`,   // left:8px 보정
            background:"linear-gradient(90deg, #60a5fa, #34d399)",
            boxShadow:"0 0 14px rgba(56,189,248,0.35)",
            borderRadius:4,
            transition:"width 180ms ease"
          }} />

          {/* 단계 점 + 라벨 */}
          <div style={{ display:"grid", gridTemplateColumns:`repeat(${steps.length}, 1fr)`, gap:0, position:"relative" }}>
            {steps.map((s, idx) => {
              const active = idx <= currentIdx;
              const current = idx === currentIdx;
              return (
                <div
                  key={s.id}
                  ref={(el) => (stepRefs.current[idx] = el)}
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}
                >
                  <div style={{
                    width: current ? 18 : 14, height: current ? 18 : 14,
                    borderRadius:"50%",
                    background: active ? "linear-gradient(180deg, #60a5fa, #34d399)" : "rgba(255,255,255,0.15)",
                    border: active ? "0" : "1px solid rgba(255,255,255,0.25)",
                    boxShadow: active ? "0 0 12px rgba(99,102,241,0.45)" : "none",
                    transition:"all 250ms ease"
                  }} />
                  <div style={{
                    fontSize: current ? 13 : 12,
                    fontWeight: current ? 800 : 600,
                    color: current ? "#eaf2ff" : "rgba(255,255,255,0.7)",
                    textAlign:"center", whiteSpace:"nowrap"
                  }}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 2. GuideCard UI (우측 상단) ───────────────────────── */
function GuideCard({ onClose }) {
  return (
    <aside style={gStyles.wrap} role="complementary" aria-label="윗몸일으키기 준비자세 가이드">
      <div style={gStyles.card}>
        <div style={gStyles.header}>
          <span style={gStyles.pill}>Guide</span>
          <button onClick={onClose} aria-label="가이드 닫기" style={gStyles.close}>×</button>
        </div>

        <div style={gStyles.title}>
          다음 그림처럼 <b style={{ color: "#7cc7ff" }}>카메라 각도 75°</b>로
          <br /> <b style={{ color: "#7cc7ff" }}>준비자세</b>를 취해주세요.
        </div>

        <div style={gStyles.imgWrap}>
          <img
            src="/situp.png"
            alt="윗몸일으키기 준비자세 예시 (카메라 75°)"
            style={gStyles.img}
            draggable={false}
          />
          <div style={gStyles.angleBadge}>75°</div>
          <div style={gStyles.caption}>준비자세 예시</div>
        </div>

        <div style={gStyles.jointBox} aria-label="인식 필수 관절 안내">
          <div style={gStyles.jointTitle}>카메라에 꼭 보여야 하는 부위</div>
          <div style={gStyles.chipGrid}>
            <span style={gStyles.chip}>어깨</span>
            <span style={gStyles.chip}>팔꿈치</span>
            <span style={gStyles.chip}>엉덩이(골반)</span>
            <span style={gStyles.chip}>무릎</span>
            <span style={gStyles.chip}>발목</span>
          </div>
          <p style={gStyles.jointHint}>
            <b>한쪽(왼쪽 또는 오른쪽)</b>의 위 5개 부위가 <b>화면 안</b>에 <b>또렷하게</b> 보여야
            정확하게 인식돼요. 몸의 <b>측면 프레이밍(약 75°)</b>을 유지하고,
            <b>무릎 각도는 약 90°</b>, <b>발바닥은 바닥에 고정</b>되게 촬영해주세요.
          </p>
        </div>
      </div>
    </aside>
  );
}

const gStyles = {
  wrap: { filter: "drop-shadow(0 18px 40px rgba(0,0,0,.35))" },
  card: {
    width: 280,
    background: "linear-gradient(180deg, rgba(20,22,30,.95) 0%, rgba(18,20,28,.9) 100%)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 14,
    padding: 12,
    color: "#e5f1ff",
    backdropFilter: "blur(6px)",
  },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between" },
  pill: {
    display:"inline-block",
    fontSize:12, fontWeight:800,
    color:"#0b5cab", background:"#dbeafe", border:"1px solid #93c5fd",
    padding:"2px 8px", borderRadius:999
  },
  close: {
    appearance:"none",
    border:"1px solid rgba(255,255,255,.16)",
    background:"transparent", color:"#e2e8f0",
    width:28, height:28, borderRadius:8,
    fontSize:18, lineHeight:"26px", textAlign:"center", cursor:"pointer"
  },
  title: { marginTop:8, fontWeight:800, fontSize:14, lineHeight:1.4 },
  imgWrap: {
    position:"relative", overflow:"hidden", borderRadius:12,
    marginTop:10, border:"1px solid rgba(255,255,255,.08)"
  },
  img: { width:"100%", display:"block", userSelect:"none" },
  angleBadge: {
    position:"absolute", top:8, left:8,
    background:"#0b5cab", color:"#fff", fontWeight:800, fontSize:12,
    padding:"4px 8px", borderRadius:999, boxShadow:"0 6px 14px rgba(11,92,171,.25)"
  },
  caption: {
    position:"absolute", bottom:8, right:8,
    background:"rgba(0,0,0,.55)", border:"1px solid rgba(255,255,255,.08)",
    fontSize:11, padding:"3px 8px", borderRadius:999, color:"#e2e8f0"
  },
  jointBox: {
    marginTop: 10, padding: 10, borderRadius: 12,
    background: "linear-gradient(180deg, rgba(15,17,24,.9) 0%, rgba(14,16,22,.85) 100%)",
    border: "1px solid rgba(255,255,255,.08)",
  },
  jointTitle: {
    fontWeight: 900, fontSize: 12, letterSpacing: "-0.2px",
    color: "#cfe8ff", marginBottom: 8,
  },
  chipGrid: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
    gap: 6, marginBottom: 6,
  },
  chip: {
    display: "inline-block", textAlign: "center", fontSize: 12,
    fontWeight: 700, padding: "6px 8px", borderRadius: 999,
    color: "#e6f0ff", background: "rgba(20,120,255,0.12)",
    border: "1px solid rgba(124,197,255,0.35)", userSelect: "none",
  },
  jointHint: {
    margin: 0, marginTop: 6, fontSize: 11,
    lineHeight: 1.45, color: "#cbd5e1",
  },
};

/* ───────────────────────── 3. HUD (좌측) ───────────────────────── */
function Dot({ color="#22c55e" }) {
  return (
    <span style={{
      display:"inline-block",
      width: 16, height: 16, borderRadius: 9999,
      background: color,
      boxShadow: `0 0 0 3px ${color}22, inset 0 0 6px rgba(0,0,0,.25)`
    }} />
  );
}
function Metric({ label, value, dot }) {
  return (
    <div style={{
      display:"grid", gridTemplateColumns: "1fr auto",
      alignItems:"center", gap: 10, padding: "10px 12px",
      background: "rgba(0,0,0,.35)",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
        {dot ? <Dot color={dot} /> : <span style={{ width:16 }} />}
        <div style={{ fontSize: 14, color:"#cbd5e1", fontWeight:700 }}>{label}</div>
      </div>
      <div style={{
        fontSize: 30, lineHeight: 1, fontWeight: 900,
        color: "#ffffff", textShadow: "0 2px 10px rgba(0,0,0,.35)"
      }}>
        {value}
      </div>
    </div>
  );
}
function jointDotColor(n) {
  if (n >= 5) return "#22c55e";
  if (n >= 3) return "#f59e0b";
  return "#ef4444";
}
function SitupHud({ status, yaw, angleOK, sideCount, bodyAngle, reps }) {
  return (
    <div style={{
      position:"absolute", left: 12, top: "50%",
      transform: "translateY(-45%)",
      display:"flex", flexDirection:"column", gap: 12
    }}>
      <div style={{
        display:"flex", flexDirection:"column", gap: 12,
        width: 300, background:"rgba(0,0,0,0.45)",
        border:"1px solid rgba(255,255,255,0.12)",
        borderRadius: 20, padding: "14px 16px",
        backdropFilter:"blur(6px)", boxShadow: "0 12px 28px rgba(0,0,0,.35)"
      }}>
        <Metric label="상태" value={status} />
        <Metric label="카메라 각도" value={`${Number.isFinite(yaw) ? Math.round(yaw) : "—"}°`} dot={angleOK ? "#22c55e" : "#ef4444"} />
        <Metric label="관절 인식" value={`${sideCount}/5`} dot={jointDotColor(sideCount)} />
        <Metric label="허리 각도" value={`${Number.isFinite(bodyAngle) ? Math.round(bodyAngle) : "—"}°`} />
        <Metric label="횟수" value={reps} />
      </div>
    </div>
  );
}

/* ───────────────────────── 4. Controls (좌측 상단) ───────────────────────── */
function CtlButton({ onClick, children, ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        appearance: "none",
        border: "1px solid rgba(255,255,255,0.18)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 12,
        fontWeight: 800,
        letterSpacing: "-0.2px",
        fontSize: "clamp(14px, 1.6vw, 18px)",
        lineHeight: 1.15,
        cursor: "pointer",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,.35)",
        transition: "transform .08s ease, background .2s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      {children}
    </button>
  );
}
function MeasureControls({ onBack, onToggleFull, isFullscreen }) {
  return (
    <div style={{
      position: "absolute",
      top: 140,
      left: 12,
      zIndex: 7,
      display: "flex", gap: 10, alignItems: "center",
      background: "rgba(0,0,0,0.42)",
      border: "1px solid rgba(255,255,255,0.14)",
      backdropFilter: "blur(8px)",
      borderRadius: 16, padding: "8px 10px",
      boxShadow: "0 10px 28px rgba(0,0,0,.35)",
    }}>
      <CtlButton onClick={onBack} ariaLabel="종목 선택으로">종목 선택으로</CtlButton>
      <CtlButton onClick={onToggleFull} ariaLabel="전체화면 전환">
        {isFullscreen ? "전체화면 해제" : "전체화면"}
      </CtlButton>
    </div>
  );
}

/* ───────────────────────── 5. 메인 컴포넌트 (UI는 위, 로직은 아래) ───────────────────────── */
export default function MeasureSitUp() {
  const nav = useNavigate();
  const { setSession } = useApp();

  // 카메라/포즈
  const { videoRef, canvasRef, landmarks, error } = usePoseCamera({ enable: true });

  // UI 상태
  const wrapRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  // ── 로직 상태(두 번째 코드의 FSM/카운트 로직 유지)
  const [phase, setPhase] = useState("guide"); // guide→countdown→running→finished
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const [yawDeg, setYawDeg] = useState(NaN);   const yawRef = useRef(NaN);
  const [angleOK, setAngleOK] = useState(false); const okRef = useRef(false);
  const [sideCount, setSideCount] = useState(0); const scRef = useRef(0);
  const [bodyAngle, setBodyAngle] = useState(NaN); const hipRef = useRef(NaN);
  const [hudStatus, setHudStatus] = useState("대기");

  const [reps, setReps] = useState(0);
  const repsRef = useRef(0);
  useEffect(() => { repsRef.current = reps; }, [reps]);

  const [countdown, setCountdown] = useState(5);

  // ⏱️ 4초 종료 타이머
  const repFinishTimerRef = useRef(null);

  // 오디오
  const situpAudioRef = useRef(null);
  useEffect(() => {
    const el = new Audio("/audio/situp-cue.mp3");
    situpAudioRef.current = el;
    return () => { try { el.pause(); } catch {} };
  }, []);

  // ── 내부 유틸: “5개 관절” 가시성 점수(손목 제외) & 엉덩이 각도
  function sideVisibilityCount5(lms, side /* "L" | "R" */) {
    const arr = side === "L"
      ? [IDX.L_SH, IDX.L_EL, IDX.L_HIP, IDX.L_KNEE, IDX.L_ANK]
      : [IDX.R_SH, IDX.R_EL, IDX.R_HIP, IDX.R_KNEE, IDX.R_ANK];
    return arr.reduce((c, i) => {
      const p = lms?.[i];
      if (!p) return c;
      const ok = (p.visibility ?? 0) >= VIS_TH && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
      return c + (ok ? 1 : 0);
    }, 0);
  }
  function hipAngle(lms, side /* "L" | "R" */) {
    if (!lms) return NaN;
    const SH = side === "L" ? lms[IDX.L_SH] : lms[IDX.R_SH];
    const HIP = side === "L" ? lms[IDX.L_HIP] : lms[IDX.R_HIP];
    const KNEE = side === "L" ? lms[IDX.L_KNEE] : lms[IDX.R_KNEE];
    if (!SH || !HIP || !KNEE) return NaN;
    return angleDeg(SH, HIP, KNEE); // 어깨-엉덩이-무릎
  }

  // 포즈 스켈레톤 드로잉(시각화는 손목 포함 가능)
  function drawSkeleton(ctx, lms) {
    if (!lms || !ctx) return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const pairs = [
      [IDX.L_SH, IDX.R_SH], [IDX.L_HIP, IDX.R_HIP],
      [IDX.L_SH, IDX.L_EL], [IDX.L_EL, IDX.L_WR],
      [IDX.R_SH, IDX.R_EL], [IDX.R_EL, IDX.R_WR],
      [IDX.L_HIP, IDX.L_KNEE], [IDX.L_KNEE, IDX.L_ANK],
      [IDX.R_HIP, IDX.R_KNEE], [IDX.R_KNEE, IDX.R_ANK],
      [IDX.L_SH, IDX.L_HIP], [IDX.R_SH, IDX.R_HIP],
    ];
    const pts = [IDX.L_SH, IDX.R_SH, IDX.L_EL, IDX.R_EL, IDX.L_WR, IDX.R_WR, IDX.L_HIP, IDX.R_HIP, IDX.L_KNEE, IDX.R_KNEE, IDX.L_ANK, IDX.R_ANK];

    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0, 200, 255, 0.9)";
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    for (const [a, b] of pairs) {
      const pa = lms[a], pb = lms[b];
      if (!pa || !pb) continue;
      if ((pa.visibility ?? 0) < VIS_TH || (pb.visibility ?? 0) < VIS_TH) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * W, pa.y * H);
      ctx.lineTo(pb.x * W, pb.y * H);
      ctx.stroke();
    }
    for (const i of pts) {
      const p = lms[i];
      if (!p || (p.visibility ?? 0) < VIS_TH) continue;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ───────── Landmark 루프: 값 계산 + FSM 로직(두 번째 코드) ───────── */
  useEffect(() => {
    if (!landmarks) return;

    // 1) 카메라 각도
    const yaw = estimateYawDeg(landmarks);
    setIfChanged(setYawDeg, yawRef, yaw);
    const okYaw = angleOKForTest("situp", yaw);
    setIfChanged(setAngleOK, okRef, okYaw);

    // 2) 좌/우 가시성(5점) & 측면 선택 + 몸각도
    const lc = sideVisibilityCount5(landmarks, "L");
    const rc = sideVisibilityCount5(landmarks, "R");
    const side = lc >= rc ? "L" : "R";
    const count = Math.max(lc, rc);
    setIfChanged(setSideCount, scRef, count);

    const ang = hipAngle(landmarks, side);
    setIfChanged(setBodyAngle, hipRef, ang);

    // 3) 카운팅 (running 단계에만)
    if (phaseRef.current === "running") {
      if (!okYaw) {
        setHudStatus("프레이밍 불량(Yaw) — 카운트 일시정지");
      } else {
        const { phaseStr, reps: newReps, debugAngle } =
          updateSitupCountByBodyAngle(ang, repsRef);
        setReps(newReps);
        setHudStatus(`각도 ${Number.isFinite(debugAngle) ? Math.round(debugAngle) : "—"}° (${phaseStr})`);
      }
    } else {
      setHudStatus("대기");
    }

    // 4) 스켈레톤 그리기
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawSkeleton(ctx, landmarks);
  }, [landmarks]);

  /* ───────── guide → countdown (600ms 안정 유지) ───────── */
  useEffect(() => {
    if (phase !== "guide") return;
    if (sideCount >= SIT_SIDE_MIN && angleOK) {
      const t = setTimeout(() => {
        setPhase("countdown");
        setCountdown(5);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [phase, sideCount, angleOK]);

  /* ───────── countdown → running ───────── */
  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setPhase("running");
          try {
            if (situpAudioRef.current) {
              situpAudioRef.current.currentTime = 0;
              situpAudioRef.current.play();
            }
          } catch {}
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  /* ───────── running: 4초 정지 시 finished + 세션 저장 ───────── */
  useEffect(() => {
    if (phase !== "running") return;
    if (reps <= 0) return;

    if (repFinishTimerRef.current) clearTimeout(repFinishTimerRef.current);
    const snapshot = reps;
    repFinishTimerRef.current = setTimeout(() => {
      if (phaseRef.current === "running" && repsRef.current === snapshot) {
        setPhase("finished");
        // 자동 저장
        setSession((s) => ({
          ...s,
          situp: { ...s.situp, reps: repsRef.current },
        }));
        try {
          if (situpAudioRef.current) {
            situpAudioRef.current.pause();
            situpAudioRef.current.currentTime = 0;
          }
        } catch {}
      }
    }, 4000);

    return () => {
      if (repFinishTimerRef.current) clearTimeout(repFinishTimerRef.current);
    };
  }, [reps, phase, setSession]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (repFinishTimerRef.current) clearTimeout(repFinishTimerRef.current);
    };
  }, []);

  // 전체화면
  async function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  }

  // 리셋(로직 리셋은 두 번째 코드와 동일)
  function handleReset() {
    resetSitupCounterByBodyAngle();
    setPhase("guide");
    setCountdown(5);
    setYawDeg(NaN);
    setAngleOK(false);
    setSideCount(0);
    setBodyAngle(NaN);
    setHudStatus("대기");
    setReps(0);
    if (repFinishTimerRef.current) clearTimeout(repFinishTimerRef.current);
    try {
      if (situpAudioRef.current) {
        situpAudioRef.current.pause();
        situpAudioRef.current.currentTime = 0;
      }
    } catch {}
  }

  // 뒤로가기 (스냅샷 저장 + 선택창 알림)
  function handleBackToSelect() {
    setSession((s) => ({
      ...s,
      situp: { ...s.situp, reps: Math.max(s?.situp?.reps ?? 0, repsRef.current) },
    }));
    nav("/select", {
      state: { justFinished: { test: "situp", summary: `횟수 ${Math.max(repsRef.current, 0)}회` } },
    });
  }

  return (
    <div style={{ padding:0, color:"#fff", background:"#000", minHeight:"100vh" }}>
      {error && (
        <div style={{ background:"#3a1120", border:"1px solid #a23", padding:8, borderRadius:8, margin:8 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ position:"relative" }} ref={wrapRef}>
        {/* 상단 플로우 리본 */}
        <div style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 6 }}>
          <SitupFlowRibbon phase={phase} countdown={countdown} />
        </div>

        {/* 좌상단 컨트롤 */}
        <MeasureControls onBack={handleBackToSelect} onToggleFull={toggleFullscreen} isFullscreen={isFullscreen} />

        {/* 비디오 & 캔버스 */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}
        />
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ position:"relative", width:"100%", height:"auto" }}
        />

        {/* 가이드 카드 */}
        {showGuide && (
          <div style={{ position:"absolute", right:12, top: 140, zIndex:5 }}>
            <GuideCard onClose={() => setShowGuide(false)} />
          </div>
        )}

        {/* HUD */}
        <SitupHud
          status={hudStatus}
          yaw={yawDeg}
          angleOK={angleOK}
          sideCount={sideCount}
          bodyAngle={bodyAngle}
          reps={reps}
        />

        {/* 좌하단 작은 버튼 영역 (리셋/결과보기) — UI는 간단히 유지 */}
        <div style={{ position:"absolute", left:12, bottom:12, display:"flex", gap:10 }}>
          <CtlButton onClick={handleReset} ariaLabel="리셋">리셋</CtlButton>
          {(phase === "running" || phase === "finished") && (
            <CtlButton onClick={() => nav("/results")} ariaLabel="결과 보기">결과 보기</CtlButton>
          )}
        </div>
      </div>
    </div>
  );
}
