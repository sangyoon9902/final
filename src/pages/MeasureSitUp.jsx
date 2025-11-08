// src/pages/MeasureSitup.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { usePoseCamera } from "../hooks/usePoseCamera";
import { estimateYawDeg, angleOKForTest } from "../logic/framing";
import { updateSitupCountByBodyAngle, resetSitupCounterByBodyAngle } from "../logic/situpCounterByBodyAngle";
import { IDX, VIS_TH, SIT_SIDE_MIN } from "../utils/poseIdx";
import { angleDeg } from "../utils/math";
import { useApp } from "../state/AppState"; // ✅ 전역 세션 저장을 위해 추가

/* ───────────────────────── GuideCard (우측 상단) ───────────────────────── */
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

        {/* ★ 추가된 관절 안내 박스 */}
        <div style={gStyles.jointBox} aria-label="인식 필수 관절 안내">
          <div style={gStyles.jointTitle}>카메라에 꼭 보여야 하는 부위</div>
          <div style={gStyles.chipGrid}>
            <span style={gStyles.chip}>어깨</span>
            <span style={gStyles.chip}>팔꿈치</span>
            <span style={gStyles.chip}>손목</span>
            <span style={gStyles.chip}>엉덩이(골반)</span>
            <span style={gStyles.chip}>무릎</span>
            <span style={gStyles.chip}>발목</span>
          </div>
          <p style={gStyles.jointHint}>
            <b>한쪽(왼쪽 또는 오른쪽)</b>의 위 6개 부위가 <b>화면 안</b>에 <b>또렷하게</b> 보여야
            정확하게 인식돼요. 몸의 <b>측면 프레이밍(약 75°)</b>을 유지하고,
            <b>무릎 각도는 약 90°</b>, <b>발바닥은 바닥에 고정</b>되게 촬영해주세요.
          </p>
        </div>

        <ul style={gStyles.list}>

        </ul>
      </div>
    </aside>
  );
}

/* ───────────────────────── Metric (세로형 HUD 아이템) ───────────────────────── */
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
      display:"grid",
      gridTemplateColumns: "1fr auto",
      alignItems:"center",
      gap: 10,
      padding: "10px 12px",
      background: "rgba(0,0,0,.35)",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
        {dot ? <Dot color={dot} /> : <span style={{ width:16 }} />}
        <div style={{ fontSize: 14, color:"#cbd5e1", fontWeight:700 }}>{label}</div>
      </div>
      <div style={{
        fontSize: 30,
        lineHeight: 1,
        fontWeight: 900,
        color: "#ffffff",
        textShadow: "0 2px 10px rgba(0,0,0,.35)"
      }}>
        {value}
      </div>
    </div>
  );
}

/* ★ 관절 인식 신호등 색상(0~2=빨강, 3~5=노랑, 6=초록) */
function jointDotColor(n) {
  if (n >= 6) return "#22c55e";   // green
  if (n >= 3) return "#f59e0b";   // amber
  return "#ef4444";               // red
}

/* ───────────────────────── Top-left Controls (새 버튼 바) ───────────────────────── */
function TopLeftControls({ onBack, onToggleFull, isFullscreen }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 7,
        display: "flex",
        gap: 10,
        alignItems: "center",
        background: "rgba(0,0,0,0.42)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(8px)",
        borderRadius: 16,
        padding: "8px 10px",
        boxShadow: "0 10px 28px rgba(0,0,0,.35)",
      }}
    >
      <CtlButton onClick={onBack} ariaLabel="종목 선택으로">종목 선택으로</CtlButton>
      <CtlButton onClick={onToggleFull} ariaLabel="전체화면 전환">
        {isFullscreen ? "전체화면 해제" : "전체화면"}
      </CtlButton>
    </div>
  );
}

function CtlButton({ onClick, children, ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        appearance: "none",
        border: "1px solid rgba(255,255,255,0.18)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 12,
        fontWeight: 800,
        letterSpacing: "-0.2px",
        // 화면 비율에 맞춘 자동 폰트/패딩
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

export default function MeasureSitUp() {
  const nav = useNavigate();
  const { setSession } = useApp(); // ✅ 완료 결과를 전역으로 저장

  // 카메라/포즈
  const { videoRef, canvasRef, landmarks, fps, error } = usePoseCamera({ enable: true });

  // 전체화면용 래퍼 ref
  const wrapRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 상태
  const [phase, setPhase] = useState("guide"); // guide→countdown→running→finished
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const [yawDeg, setYawDeg] = useState(NaN);
  const [angleOK, setAngleOK] = useState(false);
  const [sideCount, setSideCount] = useState(0);
  const [bodyAngle, setBodyAngle] = useState(NaN);
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

  // ★ 가이드 카드 표시 여부
  const [showGuide, setShowGuide] = useState(true);

  // ── 내부 유틸: 측면 가시성 점수 & 엉덩이 각도 계산
  function sideVisibilityCount(lms, side /* "L" | "R" */) {
    const arr = side === "L"
      ? [IDX.L_SH, IDX.L_EL, IDX.L_WR, IDX.L_HIP, IDX.L_KNEE, IDX.L_ANK]
      : [IDX.R_SH, IDX.R_EL, IDX.R_WR, IDX.R_HIP, IDX.R_KNEE, IDX.R_ANK];
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

  // 미디어파이프 관절 & 뼈대 그리기
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
    for (const i of [IDX.L_SH, IDX.R_SH, IDX.L_EL, IDX.R_EL, IDX.L_WR, IDX.R_WR, IDX.L_HIP, IDX.R_HIP, IDX.L_KNEE, IDX.R_KNEE, IDX.L_ANK, IDX.R_ANK]) {
      const p = lms[i];
      if (!p || (p.visibility ?? 0) < VIS_TH) continue;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // landmark 들어올 때마다 처리 + 스켈레톤 드로잉
  useEffect(() => {
    if (!landmarks) return;

    // 1) 카메라 각도 체크
    const yaw = estimateYawDeg(landmarks);
    setYawDeg(yaw);
    const okYaw = angleOKForTest("situp", yaw);
    setAngleOK(okYaw);

    // 2) 좌/우 가시성 점수 & 몸각도 산출
    const lc = sideVisibilityCount(landmarks, "L");
    const rc = sideVisibilityCount(landmarks, "R");
    const side = lc >= rc ? "L" : "R";
    const count = Math.max(lc, rc);
    setSideCount(count);

    const ang = hipAngle(landmarks, side);
    setBodyAngle(ang);

    // 3) 카운팅
    if (phaseRef.current === "running") {
      if (!okYaw) {
        setHudStatus("프레이밍 불량(Yaw) — 카운트 일시정지");
        return;
      }
      const { phaseStr, reps: newReps, debugAngle } =
        updateSitupCountByBodyAngle(ang, repsRef);
      setReps(newReps);
      setHudStatus(
        `각도 ${Number.isFinite(debugAngle) ? Math.round(debugAngle) : "—"}° (${phaseStr})`
      );
    } else {
      setHudStatus("대기");
    }

    // 4) 스켈레톤 그리기
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      drawSkeleton(ctx, landmarks);
    }
  }, [landmarks]);

  // guide → countdown 자동 전환
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

  // countdown → running
  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setPhase("running");
          try {
            situpAudioRef.current.currentTime = 0;
            situpAudioRef.current.play();
          } catch {}
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // reps 증가시 4초 종료 타이머
  useEffect(() => {
    if (phase !== "running") return;
    if (reps <= 0) return;

    if (repFinishTimerRef.current) clearTimeout(repFinishTimerRef.current);
    const snapshot = reps;
    repFinishTimerRef.current = setTimeout(() => {
      if (phaseRef.current === "running" && repsRef.current === snapshot) {
        setPhase("finished");

        // ✅ 측정 종료 시점에 전역 세션 저장 (완전 자동)
        setSession((s) => ({
          ...s,
          situp: {
            ...s.situp,
            reps: repsRef.current,
          },
        }));
      }
    }, 4000);

    return () => {
      if (repFinishTimerRef.current) clearTimeout(repFinishTimerRef.current);
    };
  }, [reps, phase, setSession]);

  // 종료 시 오디오 중지
  useEffect(() => {
    if (phase !== "finished") return;
    try {
      if (situpAudioRef.current) {
        situpAudioRef.current.pause();
        situpAudioRef.current.currentTime = 0;
      }
    } catch {}
  }, [phase]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (repFinishTimerRef.current) clearTimeout(repFinishTimerRef.current);
    };
  }, []);

  // ✅ 뒤로가기 (스냅샷 저장 후 선택화면 이동)
  function handleBackToSelect() {
    setSession((s) => ({
      ...s,
      situp: {
        ...s.situp,
        reps: Math.max(s?.situp?.reps ?? 0, repsRef.current),
      },
    }));
    nav("/select", {
      state: {
        justFinished: {
          test: "situp",
          summary: `횟수 ${Math.max(repsRef.current, 0)}회`,
        },
      },
    });
  }

  // ✅ 전체화면 토글
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

  return (
    <div style={{ padding:0, color:"#fff", background:"#000" }}>
      {error && (
        <div style={{
          background:"#3a1120", border:"1px solid #a23",
          padding:8, borderRadius:8, margin:8
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* 안내 영역 */}
      <div style={{
        background:"#1118", padding:8, borderRadius:8,
        textAlign:"center", margin:"8px"
      }}>
        {phase === "countdown"
          ? `곧 시작: ${countdown}`
          : phase === "running"
          ? "계속 반복하세요. 자동으로 카운트합니다."
          : phase === "finished"
          ? "측정 종료"
          : "프레이밍을 맞춰주세요."}
      </div>

      {/* 카메라 + 오버레이들 */}
      <div style={{ position:"relative" }} ref={wrapRef}>
        {/* ★ 왼쪽 상단 컨트롤바 */}
        <TopLeftControls
          onBack={handleBackToSelect}
          onToggleFull={toggleFullscreen}
          isFullscreen={isFullscreen}
        />

        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{
            position:"absolute", inset:0,
            width:"100%", height:"100%",
            objectFit:"cover",
          }}
        />
        {/* 관절 오버레이 캔버스 */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{
            position:"relative",
            width:"100%",
            height:"auto",
          }}
        />

        {/* ★ 우측 상단 가이드 카드 */}
        {showGuide && (
          <div style={{ position:"absolute", right:12, top:12, zIndex:5 }}>
            <GuideCard onClose={() => setShowGuide(false)} />
          </div>
        )}

        {/* 좌측-하단 HUD (버튼 블록은 제거됨) */}
        <div style={{
          position:"absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-45%)", // 중앙에서 약간 위로
          display:"flex",
          flexDirection:"column",
          gap: 12
        }}>
          <div style={{
            display:"flex",
            flexDirection:"column",
            gap: 12,
            width: 300,
            background:"rgba(0,0,0,0.45)",
            border:"1px solid rgba(255,255,255,0.12)",
            borderRadius: 20,
            padding: "14px 16px",
            backdropFilter:"blur(6px)",
            boxShadow: "0 12px 28px rgba(0,0,0,.35)"
          }}>
            <Metric label="상태" value={hudStatus} />
            <Metric
              label="카메라 각도"
              value={`${Number.isFinite(yawDeg) ? Math.round(yawDeg) : "—"}°`}
              dot={angleOK ? "#22c55e" : "#ef4444"}
            />
            {/* ▼ 관절 인식 신호등 추가 */}
            <Metric
              label="관절 인식"
              value={`${sideCount}/6`}
              dot={jointDotColor(sideCount)}
            />
            <Metric label="허리 각도" value={`${Number.isFinite(bodyAngle) ? Math.round(bodyAngle) : "—"}°`} />
            <Metric label="횟수" value={reps} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Guide styles ───────────────────────── */
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
  list: { margin:"10px 0 0", padding:"0 0 0 18px", color:"#cbd5e1", fontSize:12, lineHeight:1.5 },

  /* ▼▼ 추가된 관절 안내 스타일 ▼▼ */
  jointBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(15,17,24,.9) 0%, rgba(14,16,22,.85) 100%)",
    border: "1px solid rgba(255,255,255,.08)",
  },
  jointTitle: {
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: "-0.2px",
    color: "#cfe8ff",
    marginBottom: 8,
  },
  chipGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 6,
    marginBottom: 6,
  },
  chip: {
    display: "inline-block",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 8px",
    borderRadius: 999,
    color: "#e6f0ff",
    background: "rgba(20,120,255,0.12)",
    border: "1px solid rgba(124,197,255,0.35)",
    userSelect: "none",
  },
  jointHint: {
    margin: 0,
    marginTop: 6,
    fontSize: 11,
    lineHeight: 1.45,
    color: "#cbd5e1",
  },
};
