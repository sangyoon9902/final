// src/pages/MeasureSitAndReach.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/AppState";

import {
  estimateForwardReachSignedCmX_oneSide,
  estimateYawDeg,
  angleOKForReach,
  makePeakHoldController,
} from "../logic/sitAndReachLogic.js";

/* ───────────────────────── 공통 유틸: 값 변화시에만 setState ───────────────────────── */
function setIfChanged(setter, ref, next) {
  const bothNaN = Number.isNaN(ref.current) && Number.isNaN(next);
  if (bothNaN) return;
  if (ref.current !== next) {
    ref.current = next;
    setter(next);
  }
}

// 좌전굴 규칙: 최대치에서 1초 유지 (최대치 표시에만 사용, 평균 갱신은 안정 윈도우로 별도 구현)
const peakHold = makePeakHoldController({
  needSec: 1.0,
  fps: 30,
  tolCm: 1.0,
  minIncrementToArm: 0.5,
});
const READY_HOLD_NEED = 30; // 1초(30fps)

/* ───────────────────────── 1) FlowRibbon ───────────────────────── */
const reachSteps = [
  { id: "ready",    label: "자세 준비" },
  { id: "running",  label: "측정 중" },
  { id: "finished", label: "측정 완료" },
];

function ReachFlowRibbon({ phase, holdAtPeakSec = "0.0" }) {
  const currentId = phase === "running" ? "running" : phase === "finished" ? "finished" : "ready";
  const indexOf = (id) => reachSteps.findIndex((s) => s.id === id);
  const currentIdx = Math.max(0, indexOf(currentId));

  let localProgress = 0;
  if (phase === "ready") localProgress = 0.75;
  else if (phase === "running") localProgress = Math.min(1, parseFloat(holdAtPeakSec) / 1.0);
  else if (phase === "finished") localProgress = 1;

  const totalProgress = (currentIdx + localProgress) / (reachSteps.length - 1);

  const rightText =
    phase === "ready"
      ? "Yaw 90° 근처 + 관절 6/6 인식되면 자동 시작"
      : phase === "running"
      ? `안정 1초 유지! (${holdAtPeakSec}s / 1.0s)`
      : "측정 완료 ✅";

  return (
    <div>
      <div style={{
        position:"relative", borderRadius:14, padding:"14px 18px",
        background:"linear-gradient(180deg, rgba(18,18,22,0.95), rgba(10,10,12,0.9))",
        border:"1px solid rgba(255,255,255,0.10)",
        boxShadow:"0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)"
      }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:10 }}>
          <span style={{ fontSize:16, fontWeight:800, letterSpacing:0.2, color:"#eaeefb" }}>앉아 윗몸 굽히기</span>
          <span style={{ fontSize:12, opacity:0.85 }}>{rightText}</span>
        </div>
        <div style={{ position:"relative", padding:"10px 0 4px" }}>
          <div style={{ position:"absolute", left:8, right:8, top:"50%", height:4, transform:"translateY(-50%)",
                        background:"rgba(255,255,255,0.08)", borderRadius:4 }} />
          <div style={{
            position:"absolute", left:8, right:`calc(8px + ${(1-totalProgress)*100}%)`, top:"50%", height:4,
            transform:"translateY(-50%)",
            background:"linear-gradient(90deg, #60a5fa, #34d399)",
            boxShadow:"0 0 14px rgba(56,189,248,0.35)", borderRadius:4, transition:"right 300ms ease"
          }} />
          <div style={{ display:"grid", gridTemplateColumns:`repeat(${reachSteps.length}, 1fr)`, gap:0, position:"relative" }}>
            {reachSteps.map((s, idx) => {
              const active = idx <= currentIdx; const current = idx === currentIdx;
              return (
                <div key={s.id} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                  <div style={{
                    width: current ? 18 : 14, height: current ? 18 : 14, borderRadius:"50%",
                    background: active ? "linear-gradient(180deg, #60a5fa, #34d399)" : "rgba(255,255,255,0.15)",
                    border: active ? "0" : "1px solid rgba(255,255,255,0.25)",
                    boxShadow: active ? "0 0 12px rgba(99,102,241,0.45)" : "none",
                    transition:"all 250ms ease"
                  }} />
                  <div style={{
                    fontSize: current ? 13 : 12, fontWeight: current ? 800 : 600,
                    color: current ? "#eaf2ff" : "rgba(255,255,255,0.7)",
                    textAlign:"center", whiteSpace:"nowrap"
                  }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 2) 공통 UI ───────────────────────── */
function CtlButton({ onClick, children, ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        appearance:"none", border:"1px solid rgba(255,255,255,0.18)",
        background:"linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)",
        color:"#fff", padding:"10px 16px", borderRadius:12, fontWeight:800, letterSpacing:"-0.2px",
        fontSize:"clamp(14px, 1.6vw, 18px)", lineHeight:1.15, cursor:"pointer",
        boxShadow:"inset 0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,.35)",
        transition:"transform .08s ease, background .2s ease",
      }}
      onMouseDown={(e)=> (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e)=> (e.currentTarget.style.transform = "translateY(0)")}
    >{children}</button>
  );
}
function TopLeftControls({ onBack, onToggleFull, isFullscreen }) {
  return (
    <div style={{
      position:"absolute", top:140, left:12, zIndex:10, display:"flex", gap:10, alignItems:"center",
      background:"rgba(0,0,0,0.42)", border:"1px solid rgba(255,255,255,0.14)",
      backdropFilter:"blur(8px)", borderRadius:16, padding:"8px 10px", boxShadow:"0 10px 28px rgba(0,0,0,.35)"
    }}>
      <CtlButton onClick={onBack}>종목 선택으로</CtlButton>
      <CtlButton onClick={onToggleFull}>{isFullscreen ? "전체화면 해제" : "전체화면"}</CtlButton>
    </div>
  );
}
function Dot({ color="#22c55e" }) {
  return <span style={{ display:"inline-block", width:16, height:16, borderRadius:9999, background:color,
                        boxShadow:`0 0 0 3px ${color}22, inset 0 0 6px rgba(0,0,0,.25)` }} />;
}
function Metric({ label, value, dot }) {
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"1fr auto", alignItems:"center", gap:10, padding:"10px 12px",
      background:"rgba(0,0,0,.35)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {dot ? <Dot color={dot} /> : <span style={{ width:16 }} />}
        <div style={{ fontSize:14, color:"#cbd5e1", fontWeight:700 }}>{label}</div>
      </div>
      <div style={{ fontSize:30, lineHeight:1, fontWeight:900, color:"#fff", textShadow:"0 2px 10px rgba(0,0,0,.35)" }}>
        {value}
      </div>
    </div>
  );
}

/* ───────────────────────── 3) GuideCard ───────────────────────── */
function GuideCard({ onClose }) {
  return (
    <aside style={gStyles.wrap} role="complementary" aria-label="좌전굴 준비자세 가이드">
      <div style={gStyles.card}>
        <div style={gStyles.header}>
          <span style={gStyles.pill}>Guide</span>
          <button onClick={onClose} aria-label="가이드 닫기" style={gStyles.close}>×</button>
        </div>

        <div style={gStyles.title}>
          <b style={{ color:"#7cc7ff" }}>전신이 화면에 모두</b> 나오게 배치해주세요.<br/>
          <b style={{ color:"#7cc7ff" }}>최대치 1초 유지</b> 시 자동 기록됩니다.
        </div>

        <div style={gStyles.imgWrap}>
          <img src="/reach.png" alt="좌전굴 준비자세 예시 (카메라 90° 측면, 전신 프레이밍)" style={gStyles.img} draggable={false} />
          <div style={gStyles.angleBadge}>90°</div>
          <div style={gStyles.caption}>전신이 보이도록 프레이밍</div>
        </div>

        <div style={gStyles.jointBox} aria-label="인식 필수 관절 안내">
          <div style={gStyles.jointTitle}>카메라에 꼭 보여야 하는 부위</div>
          <div style={gStyles.chipGrid}>
            <span style={gStyles.chip}>어깨</span><span style={gStyles.chip}>팔꿈치</span><span style={gStyles.chip}>손목</span>
            <span style={gStyles.chip}>엉덩이(골반)</span><span style={gStyles.chip}>무릎</span><span style={gStyles.chip}>발목</span>
          </div>
          <p style={gStyles.jointHint}>한쪽(왼/오) 6부위가 화면 안에 또렷하게 보여야 정확합니다. <b>Yaw 85~95°</b>를 맞춰주세요.</p>
        </div>
      </div>
    </aside>
  );
}

/* ───────────────────────── 4) 본 컴포넌트 ───────────────────────── */
export default function MeasureSitAndReach() {
  const nav = useNavigate();
  const { profile, setSession } = useApp();
  const userHeight = Number(profile?.height || 170);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [hudFps, setHudFps] = useState(0);
  const [yawDeg, setYawDeg] = useState(NaN); const yawRef = useRef(NaN);
  const [angleOK, setAngleOK] = useState(false); const okRef = useRef(false);
  const [sideCount, setSideCount] = useState(0); const visRef = useRef(0); // 0~6

  const [phase, setPhase] = useState("ready");
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const [currentReachCm, setCurrentReachCm] = useState(0); const curRef = useRef(0);
  const [bestReachCm, setBestReachCm] = useState(0);              // 세션 전체 최대치
  const [bestAvgHoldCm, setBestAvgHoldCm] = useState(-Infinity);  // 1초 안정 유지 평균 최고
  const [holdAtPeakSec, setHoldAtPeakSec] = useState("0.0");
  const [readyFrameOk, setReadyFrameOk] = useState(false);
  const [whichSide, setWhichSide] = useState("-");
  const [error, setError] = useState("");

  const bestRef = useRef(0);
  useEffect(() => { bestRef.current = bestReachCm; }, [bestReachCm]);

  // 안정 윈도우(1초, ±2cm)
  const STABLE_TOL_CM = 2.0;
  const STABLE_FPS = 30;
  const STABLE_NEED_FRAMES = Math.round(1.0 * STABLE_FPS);

  const stableSumRef    = useRef(0);
  const stableCountRef  = useRef(0);
  const stableMinRef    = useRef(+Infinity);
  const stableMaxRef    = useRef(-Infinity);
  const stableFramesRef = useRef(0);

  // 자동 시작 제어
  const [autoStartArmed, setAutoStartArmed] = useState(true);
  const readyHoldRef = useRef(0);
  const yawOKRef = useRef(false);

  // 전체화면
  const wrapRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  async function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen(); setIsFullscreen(true); }
      else { await document.exitFullscreen(); setIsFullscreen(false); }
    } catch {}
  }

  // 관절 인덱스/가시성
  const IDX = { L_SH:11, R_SH:12, L_EL:13, R_EL:14, L_WR:15, R_WR:16, L_HIP:23, R_HIP:24, L_KNEE:25, R_KNEE:26, L_ANK:27, R_ANK:28 };
  const VIS_TH = 0.45;
  function sideVisibilityCount(lms, side) {
    const arr = side === "L" ? [IDX.L_SH, IDX.L_EL, IDX.L_WR, IDX.L_HIP, IDX.L_KNEE, IDX.L_ANK]
                             : [IDX.R_SH, IDX.R_EL, IDX.R_WR, IDX.R_HIP, IDX.R_KNEE, IDX.R_ANK];
    return arr.reduce((c,i)=>{
      const p = lms?.[i]; if(!p) return c;
      const ok = (p.visibility ?? 0) >= VIS_TH && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1;
      return c + (ok?1:0);
    },0);
  }

  /* ───────── MediaPipe Pose 루프 ───────── */
  useEffect(() => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl) return;
    const ctx = canvasEl.getContext("2d");

    const pose = new window.Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    pose.setOptions({ modelComplexity:1, smoothLandmarks:true, enableSegmentation:false, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });

    let lastTs = performance.now();

    pose.onResults((res) => {
      const now = performance.now();
      const fps = Math.round(1000 / Math.max(16, now - lastTs));
      lastTs = now; setHudFps(fps);

      const img = res.image;
      if (img) {
        if (canvasEl.width !== img.width || canvasEl.height !== img.height) {
          canvasEl.width = img.width; canvasEl.height = img.height;
        }
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
      }

      const lms = res.poseLandmarks;
      if (!lms?.length) return;

      if (window.drawConnectors && window.POSE_CONNECTIONS) {
        window.drawConnectors(ctx, lms, window.POSE_CONNECTIONS, { lineWidth: 3 });
        window.drawLandmarks(ctx, lms, { radius: 3 });
      }

      const yaw = estimateYawDeg(lms);
      const okYaw = angleOKForReach(yaw, 85, 95);
      const lc = sideVisibilityCount(lms,"L");
      const rc = sideVisibilityCount(lms,"R");
      const vis = Math.max(lc, rc);

      setIfChanged(setYawDeg,  yawRef, yaw);
      setIfChanged(setAngleOK, okRef,  okYaw);
      setIfChanged(setSideCount, visRef, vis);
      yawOKRef.current = okYaw;

      /* READY: 조건 1초 유지 시 RUNNING 진입 */
      if (phaseRef.current === "ready") {
        const framingOK = okYaw && vis >= 6;
        setReadyFrameOk(framingOK);
        if (framingOK) {
          readyHoldRef.current += 1;
          if (autoStartArmed && readyHoldRef.current >= READY_HOLD_NEED) {
            setAutoStartArmed(false);
            // 새 안정 윈도우 시작 (최대/베스트 평균은 유지)
            peakHold.reset();
            setIfChanged(setCurrentReachCm, curRef, 0);
            setHoldAtPeakSec("0.0");
            setWhichSide("-");

            // 안정 윈도우 리셋
            stableSumRef.current    = 0;
            stableCountRef.current  = 0;
            stableMinRef.current    = +Infinity;
            stableMaxRef.current    = -Infinity;
            stableFramesRef.current = 0;

            if (phaseRef.current !== "running") setPhase("running"); // 중복 전이 방지
          }
        } else {
          readyHoldRef.current = 0;
        }
        return;
      }

      /* RUNNING: 1초 안정(±2cm) 유지 시 평균 갱신 + 프레이밍 이탈 처리 */
      if (phaseRef.current === "running") {
        if (!okYaw || vis < 6) {
          // 프레이밍 이탈: ready 복귀 (최대/최고평균 보존)
          peakHold.breakHold();
          if (phaseRef.current !== "ready") setPhase("ready");
          setIfChanged(setCurrentReachCm, curRef, 0);
          setHoldAtPeakSec("0.0");
          setWhichSide("-");
          setAutoStartArmed(true);
          readyHoldRef.current = 0;

          // 안정 윈도우 리셋
          stableSumRef.current    = 0;
          stableCountRef.current  = 0;
          stableMinRef.current    = +Infinity;
          stableMaxRef.current    = -Infinity;
          stableFramesRef.current = 0;

          return;
        }

        // ① cm 계산/표시
        const { cm, side, ok } = estimateForwardReachSignedCmX_oneSide(lms, userHeight);
        if (ok && side) setWhichSide(side);
        const cmSan = Number.isFinite(cm) ? cm : 0;
        setIfChanged(setCurrentReachCm, curRef, cmSan);

        // 최대치 갱신
        if (cmSan > bestRef.current) setBestReachCm(cmSan);

        // ② 안정 윈도우(range ≤ 2cm) 누적
        if (!Number.isFinite(stableMinRef.current)) {
          stableMinRef.current    = cmSan;
          stableMaxRef.current    = cmSan;
          stableSumRef.current    = cmSan;
          stableCountRef.current  = 1;
          stableFramesRef.current = 1;
        } else {
          const nextMin = Math.min(stableMinRef.current, cmSan);
          const nextMax = Math.max(stableMaxRef.current, cmSan);
          if (nextMax - nextMin <= STABLE_TOL_CM) {
            stableMinRef.current    = nextMin;
            stableMaxRef.current    = nextMax;
            stableSumRef.current   += cmSan;
            stableCountRef.current += 1;
            stableFramesRef.current+= 1;
          } else {
            stableMinRef.current    = cmSan;
            stableMaxRef.current    = cmSan;
            stableSumRef.current    = cmSan;
            stableCountRef.current  = 1;
            stableFramesRef.current = 1;
          }
        }

        // ③ HUD: 안정 유지 경과초 표시
        const stableSec = stableFramesRef.current / STABLE_FPS;
        setHoldAtPeakSec(stableSec.toFixed(1));

        // ④ 1초 충족 시 평균 계산 & 최고값이면 갱신 → 다음 윈도우 준비
        if (stableFramesRef.current >= STABLE_NEED_FRAMES) {
          const avg = stableSumRef.current / Math.max(1, stableCountRef.current);
          if (avg > bestAvgHoldCm) setBestAvgHoldCm(avg);

          // 다음 안정 구간 준비
          stableMinRef.current    = +Infinity;
          stableMaxRef.current    = -Infinity;
          stableSumRef.current    = 0;
          stableCountRef.current  = 0;
          stableFramesRef.current = 0;
        }

        return;
      }
    });

    const camera = new window.Camera(videoEl, {
      onFrame: async () => { await pose.send({ image: videoEl }); },
      width: 1280, height: 720,
    });

    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.autoplay = true;

    camera.start().catch((e) => {
      console.error(e);
      setError("카메라 시작 실패: HTTPS/권한/브라우저 설정을 확인하세요.");
    });

    return () => {
      try { camera.stop(); } catch {}
      try { pose.close(); } catch {}
      peakHold.reset();
    };
  }, [userHeight]); // 의존성 최소화

  /* 핸들러 */
  function handleReset() {
    peakHold.reset();
    setPhase("ready");
    setYawDeg(NaN);
    setAngleOK(false);
    setReadyFrameOk(false);
    setIfChanged(setCurrentReachCm, curRef, 0);
    setHoldAtPeakSec("0.0");
    setWhichSide("-");
    setAutoStartArmed(true);

    stableSumRef.current    = 0;
    stableCountRef.current  = 0;
    stableMinRef.current    = +Infinity;
    stableMaxRef.current    = -Infinity;
    stableFramesRef.current = 0;
  }
  function handleBackToSelectSaveOnly() {
    const best = Number.isFinite(bestRef.current) ? bestRef.current : 0;
    const bestAvg = Number.isFinite(bestAvgHoldCm) ? Number(bestAvgHoldCm.toFixed(1)) : 0;
    setSession((prev) => ({
      ...prev,
      reach: {
        ...(prev.reach ?? {}),
        bestCm: best,
        avgCm: bestAvg,  // 1초 안정 유지 "최고 평균"
        measuredAt: new Date().toISOString(),
      },
    }));
    nav("/select");
  }

  const pillStyle = { background:"#0b0b0bcc", color:"#fff", border:"1px solid #444", borderRadius:8, padding:"4px 8px", fontSize:12, lineHeight:1.3, backdropFilter:"blur(3px)" };
  const fmt = (v) => `${v >= 0 ? "+" : ""}${Number.isFinite(v) ? v.toFixed(1) : "—"} cm`;
  const bestAvgDisplay = Number.isFinite(bestAvgHoldCm) ? fmt(bestAvgHoldCm) : "—";

  return (
    <div style={{ padding:0, color:"#fff", backgroundColor:"#000" }}>
      {error && <div style={{ background:"#3a1120", border:"1px solid #a23", padding:8, borderRadius:8, margin:8 }}>⚠️ {error}</div>}

      <div style={{ position:"relative" }} ref={wrapRef}>
        <div style={{ position:"absolute", top:12, left:12, right:12, zIndex:6 }}>
          <ReachFlowRibbon phase={phase} holdAtPeakSec={holdAtPeakSec} />
        </div>

        <TopLeftControls onBack={handleBackToSelectSaveOnly} onToggleFull={toggleFullscreen} isFullscreen={isFullscreen} />

        <video ref={videoRef} playsInline autoPlay muted
               style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", zIndex:1 }} />
        <canvas ref={canvasRef} width={1280} height={720}
                style={{ width:"100%", height:"auto", display:"block", zIndex:2, position:"relative" }} />

        <div style={{ position:"absolute", right:12, top:140, zIndex:9 }}>
          <GuideCard onClose={() => {}} />
        </div>

        {/* 좌측 HUD */}
        <div style={{
          position:"absolute", left:12, top:"50%", transform:"translateY(-45%)",
          zIndex:9, display:"flex", flexDirection:"column", gap:12, width:300,
          background:"rgba(0,0,0,0.45)", border:"1px solid rgba(255,255,255,0.12)",
          borderRadius:20, padding:"14px 16px", backdropFilter:"blur(6px)", boxShadow:"0 12px 28px rgba(0,0,0,.35)"
        }}>
          <Metric label="카메라 각도" value={`${Number.isFinite(yawDeg) ? Math.round(yawDeg) : "—"}°`} dot={angleOK ? "#22c55e" : "#ef4444"} />
          <Metric label="관절 인식" value={`${sideCount}/6`} dot={sideCount >= 6 ? "#22c55e" : "#ef4444"} />
          <Metric label="현재" value={fmt(currentReachCm)} />
          <Metric label="최대" value={fmt(bestReachCm)} />
          <Metric label="평균(유지·최고)" value={bestAvgDisplay} />
          {phase === "running" && <Metric label="안정 유지" value={`${holdAtPeakSec}s / 1.0s`} />}
          {phase === "ready" && (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <span style={pillStyle}>세팅 {readyFrameOk ? "🟢OK" : "🔴조정필요"}</span>
              <span style={pillStyle}>자동시작 {autoStartArmed ? "ON" : "OFF"}</span>
            </div>
          )}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
            <CtlButton onClick={handleReset}>초기화</CtlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const gStyles = {
  wrap: { filter:"drop-shadow(0 18px 40px rgba(0,0,0,.35))" },
  card: {
    width:280,
    background:"linear-gradient(180deg, rgba(20,22,30,.95) 0%, rgba(18,20,28,.9) 100%)",
    border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:12, color:"#e5f1ff", backdropFilter:"blur(6px)"
  },
  header:{ display:"flex", alignItems:"center", justifyContent:"space-between" },
  pill:{ display:"inline-block", fontSize:12, fontWeight:800, color:"#0b5cab", background:"#dbeafe", border:"1px solid #93c5fd", padding:"2px 8px", borderRadius:999 },
  close:{ appearance:"none", border:"1px solid rgba(255,255,255,.16)", background:"transparent", color:"#e2e8f0",
          width:28, height:28, borderRadius:8, fontSize:18, lineHeight:"26px", textAlign:"center", cursor:"pointer" },
  title:{ marginTop:8, fontWeight:800, fontSize:14, lineHeight:1.4 },
  imgWrap:{ position:"relative", overflow:"hidden", borderRadius:12, marginTop:10, border:"1px solid rgba(255,255,255,.08)" },
  img:{ width:"100%", display:"block", userSelect:"none" },
  angleBadge:{ position:"absolute", top:8, left:8, background:"#0b5cab", color:"#fff", fontWeight:800, fontSize:12, padding:"4px 8px", borderRadius:999, boxShadow:"0 6px 14px rgba(11,92,171,.25)" },
  caption:{ position:"absolute", bottom:8, right:8, background:"rgba(0,0,0,.55)", border:"1px solid rgba(255,255,255,.08)", fontSize:11, padding:"3px 8px", borderRadius:999, color:"#e2e8f0" },
  jointBox:{ marginTop:10, padding:10, borderRadius:12, background:"linear-gradient(180deg, rgba(15,17,24,.9) 0%, rgba(14,16,22,.85) 100%)", border:"1px solid rgba(255,255,255,.08)" },
  jointTitle:{ fontWeight:900, fontSize:12, letterSpacing:"-0.2px", color:"#cfe8ff", marginBottom:8 },
  chipGrid:{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6, marginBottom:6 },
  chip:{ display:"inline-block", textAlign:"center", fontSize:12, fontWeight:700, padding:"6px 8px", borderRadius:999, color:"#e6f0ff",
         background:"rgba(20,120,255,0.12)", border:"1px solid rgba(124,197,255,0.35)", userSelect:"none" },
  jointHint:{ margin:0, marginTop:6, fontSize:11, lineHeight:1.45, color:"#cbd5e1" },
};
