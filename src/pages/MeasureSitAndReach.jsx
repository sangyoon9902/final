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

// 좌전굴 규칙: 최대치에서 3초 유지
const peakHold = makePeakHoldController({
  needSec: 3.0,
  fps: 30,
  tolCm: 1.0,
  minIncrementToArm: 0.5,
});
const READY_HOLD_NEED = 30; // yaw OK 1초 유지(30fps 기준)

/* ───────── 공통 UI 컴포넌트 ───────── */
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
        fontSize: "clamp(14px, 1.6vw, 18px)",
        lineHeight: 1.15,
        cursor: "pointer",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,.35)",
        transition: "transform .08s ease, background .2s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      {children}
    </button>
  );
}
function TopLeftControls({ onBack, onToggleFull, isFullscreen }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
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
      <CtlButton onClick={onBack}>종목 선택으로</CtlButton>
      <CtlButton onClick={onToggleFull}>
        {isFullscreen ? "전체화면 해제" : "전체화면"}
      </CtlButton>
    </div>
  );
}
function Dot({ color = "#22c55e" }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        borderRadius: 9999,
        background: color,
        boxShadow: `0 0 0 3px ${color}22, inset 0 0 6px rgba(0,0,0,.25)`,
      }}
    />
  );
}
function Metric({ label, value, dot }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "rgba(0,0,0,.35)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {dot ? <Dot color={dot} /> : <span style={{ width: 16 }} />}
        <div style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 700 }}>
          {label}
        </div>
      </div>
      <div
        style={{
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 900,
          color: "#fff",
          textShadow: "0 2px 10px rgba(0,0,0,.35)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ───────────────────────── GuideCard (우측 상단) ───────────────────────── */
function GuideCard({ onClose }) {
  return (
    <aside style={gStyles.wrap} role="complementary" aria-label="좌전굴 준비자세 가이드">
      <div style={gStyles.card}>
        <div style={gStyles.header}>
          <span style={gStyles.pill}>Guide</span>
          <button onClick={onClose} aria-label="가이드 닫기" style={gStyles.close}>
            ×
          </button>
        </div>

        <div style={gStyles.title}>
          <b style={{ color: "#7cc7ff" }}>카메라 90° 측면</b>으로
          <br />
          <b style={{ color: "#7cc7ff" }}>전신이 화면에 모두</b> 나오게 배치해주세요.
        </div>

        <div style={gStyles.imgWrap}>
          <img
            src="/reach.png"
            alt="좌전굴 준비자세 예시 (카메라 90° 측면, 전신 프레이밍)"
            style={gStyles.img}
            draggable={false}
          />
          <div style={gStyles.angleBadge}>90°</div>
          <div style={gStyles.caption}>전신이 보이도록 프레이밍</div>
        </div>

        {/* ★ 인식 필수 관절 안내 */}
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
            <b>한쪽(왼쪽/오른쪽)</b>의 위 6개 부위가 <b>화면 안</b>에 <b>또렷하게</b> 보여야
            정확하게 인식돼요. 몸의 <b>정확한 측면(85~95°)</b>을 맞춰주세요.
          </p>
        </div>
      </div>
    </aside>
  );
}

/* ───────── 본 컴포넌트 ───────── */
export default function MeasureSitAndReach() {
  const nav = useNavigate();
  const { profile, setSession } = useApp();
  const userHeight = Number(profile?.height || 170);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [hudFps, setHudFps] = useState(0);
  const [yawDeg, setYawDeg] = useState(NaN);
  const [angleOK, setAngleOK] = useState(false);
  const [sideCount, setSideCount] = useState(0); // 0~6

  // ready → countdown → running → finished
  const [phase, setPhase] = useState("ready");
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [count, setCount] = useState(5);
  const [currentReachCm, setCurrentReachCm] = useState(0);
  const [bestReachCm, setBestReachCm] = useState(0);
  const [holdAtPeakSec, setHoldAtPeakSec] = useState("0.0");
  const [readyFrameOk, setReadyFrameOk] = useState(false);
  const [whichSide, setWhichSide] = useState("-");
  const [subtitle, setSubtitle] = useState(
    "카메라를 90° 측면으로 두고 전신이 보이게 프레이밍하세요. 준비되면 1초 유지 시 자동 시작합니다."
  );
  const [error, setError] = useState("");

  // 가이드 표시
  const [showGuide, setShowGuide] = useState(true);

  // 최신 best 읽기용
  const bestRef = useRef(0);
  useEffect(() => {
    bestRef.current = bestReachCm;
  }, [bestReachCm]);

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
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  }

  // ── 관절 인식 유틸
  const IDX = {
    L_SH: 11, R_SH: 12, L_EL: 13, R_EL: 14, L_WR: 15, R_WR: 16,
    L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANK: 27, R_ANK: 28,
  };
  const VIS_TH = 0.45;

  function sideVisibilityCount(lms, side /* "L" | "R" */) {
    const arr = side === "L"
      ? [IDX.L_SH, IDX.L_EL, IDX.L_WR, IDX.L_HIP, IDX.L_KNEE, IDX.L_ANK]
      : [IDX.R_SH, IDX.R_EL, IDX.R_WR, IDX.R_HIP, IDX.R_KNEE, IDX.R_ANK];
    return arr.reduce((c, i) => {
      const p = lms?.[i];
      if (!p) return c;
      const ok =
        (p.visibility ?? 0) >= VIS_TH &&
        p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
      return c + (ok ? 1 : 0);
    }, 0);
  }

  /* ───────── MediaPipe Pose 루프 ───────── */
  useEffect(() => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    const ctx = canvasEl.getContext("2d");

    const pose = new window.Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    let lastTs = performance.now();

    pose.onResults((res) => {
      const now = performance.now();
      const fps = Math.round(1000 / Math.max(16, now - lastTs));
      lastTs = now;
      setHudFps(fps);

      const img = res.image;
      if (img) {
        if (canvasEl.width !== img.width || canvasEl.height !== img.height) {
          canvasEl.width = img.width;
          canvasEl.height = img.height;
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
      setYawDeg(yaw);
      const okYaw = angleOKForReach(yaw, 85, 95);
      setAngleOK(okYaw);
      yawOKRef.current = okYaw;

      // 관절 인식(좌/우 중 더 많은 쪽)
      const lc = sideVisibilityCount(lms, "L");
      const rc = sideVisibilityCount(lms, "R");
      setSideCount(Math.max(lc, rc));

      // ready → 자동 시작
      if (phaseRef.current === "ready") {
        setReadyFrameOk(okYaw);
        if (okYaw) {
          readyHoldRef.current += 1;
          const remainSec = Math.max(0, (READY_HOLD_NEED - readyHoldRef.current) / 30);
          setSubtitle(
            remainSec > 0
              ? `측면 각도 OK 유지 중… 약 ${remainSec.toFixed(1)}초 뒤 자동 시작`
              : "자동 시작!"
          );
          if (autoStartArmed && readyHoldRef.current >= READY_HOLD_NEED) {
            setAutoStartArmed(false);
            handleStartMeasure();
          }
        } else {
          readyHoldRef.current = 0;
          setSubtitle("카메라를 90° 측면으로 두고 전신이 보이게 프레이밍하세요. 준비되면 1초 유지 후 자동 시작.");
        }
        return;
      }

      // countdown: 이탈 시 취소
      if (phaseRef.current === "countdown") {
        if (!okYaw) {
          setSubtitle("프레이밍 이탈로 카운트다운이 취소되었습니다. 다시 자세를 맞추세요.");
          setPhase("ready");
        }
        return;
      }

      // running: 전방 뻗기 계산 + 피크 유지
      if (phaseRef.current === "running") {
        if (!okYaw) {
          peakHold.breakHold();
          setSubtitle("측면 각도 벗어남 (85~95° 필요). 다시 맞추면 이어집니다.");
          return;
        }

        const { cm, side, ok } = estimateForwardReachSignedCmX_oneSide(lms, userHeight);
        if (ok && side) setWhichSide(side);
        const cmSan = Number.isFinite(cm) ? cm : 0;
        setCurrentReachCm(cmSan);

        const { bestCm, armed, holdSec, done } = peakHold.push(cmSan);
        setBestReachCm(bestCm);
        setHoldAtPeakSec(holdSec.toFixed(1));

        if (!armed) setSubtitle("더 멀리 뻗어보세요. 최대점에서 3초 유지 시 완료!");
        else if (!done) setSubtitle("좋아요! 유지 중… 3초간 흔들림 없이 버티세요.");
        else {
          setPhase("finished");
          setSubtitle("측정 완료! 결과를 저장하세요.");
        }
        return;
      }
    });

    const camera = new window.Camera(videoEl, {
      onFrame: async () => {
        await pose.send({ image: videoEl });
      },
      width: 1280,
      height: 720,
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
  }, [userHeight, autoStartArmed]);

  // 카운트다운 타이머
  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = setInterval(() => {
      if (!yawOKRef.current) {
        clearInterval(timer);
        setSubtitle("프레이밍 이탈로 카운트다운 취소.");
        setPhase("ready");
        return;
      }
      setCount((c) => {
        if (c <= 1) {
          clearInterval(timer);
          peakHold.reset();
          setBestReachCm(0);
          setCurrentReachCm(0);
          setHoldAtPeakSec("0.0");
          setWhichSide("-");
          setSubtitle("측정 시작!");
          setPhase("running");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // ───────── 핸들러들 ─────────
  function handleStartMeasure() {
    if (phase !== "ready") return;
    setCount(5);
    setPhase("countdown");
    readyHoldRef.current = 0;
  }
  function handleReset() {
    peakHold.reset();
    setPhase("ready");
    setCount(5);
    setYawDeg(NaN);
    setAngleOK(false);
    setReadyFrameOk(false);
    setCurrentReachCm(0);
    setBestReachCm(0);
    setHoldAtPeakSec("0.0");
    setWhichSide("-");
    setAutoStartArmed(true);
    readyHoldRef.current = 0;
    setSubtitle(
      "카메라를 90° 측면으로 두고 전신이 보이게 프레이밍하세요. 준비되면 1초 유지 시 자동 시작합니다."
    );
  }
  // 저장 후 선택으로
  function handleBackToSelectSaveOnly() {
    const best = Number.isFinite(bestRef.current) ? bestRef.current : 0;
    setSession((prev) => ({
      ...prev,
      reach: {
        ...(prev.reach ?? {}),
        bestCm: best,
        measuredAt: new Date().toISOString(),
      },
    }));
    nav("/select");
  }

  const pillStyle = {
    background: "#0b0b0bcc",
    color: "#fff",
    border: "1px solid #444", // ✅ 따옴표 수정
    borderRadius: 8,
    padding: "4px 8px",
    fontSize: 12,
    lineHeight: 1.3,
    backdropFilter: "blur(3px)",
  };

  return (
    <div style={{ padding: 0, color: "#fff", backgroundColor: "#000" }}>
      {error && (
        <div
          style={{
            background: "#3a1120",
            border: "1px solid #a23",
            padding: 8,
            borderRadius: 8,
            margin: 8,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* 상단 안내 배너 */}
      <div
        style={{
          background: "#1118",
          padding: 8,
          borderRadius: 8,
          textAlign: "center",
          margin: 8,
        }}
      >
        {phase === "countdown" ? `곧 시작: ${count}` : subtitle}
      </div>

      {/* 카메라 + 오버레이 */}
      <div style={{ position: "relative" }} ref={wrapRef}>
        <TopLeftControls
          onBack={handleBackToSelectSaveOnly}
          onToggleFull={toggleFullscreen}
          isFullscreen={isFullscreen}
        />

        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 1,
          }}
        />
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            zIndex: 2,
            position: "relative",
          }}
        />

        {/* 가이드 카드 */}
        {showGuide && (
          <div style={{ position: "absolute", right: 12, top: 12, zIndex: 9 }}>
            <GuideCard onClose={() => setShowGuide(false)} />
          </div>
        )}

        {/* 좌측 중앙 HUD */}
        <div
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-45%)",
            zIndex: 9,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: 300,
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 20,
            padding: "14px 16px",
            backdropFilter: "blur(6px)",
            boxShadow: "0 12px 28px rgba(0,0,0,.35)",
          }}
        >
          <Metric
            label="카메라 각도"
            value={`${Number.isFinite(yawDeg) ? Math.round(yawDeg) : "—"}°`}
            dot={angleOK ? "#22c55e" : "#ef4444"}
          />
          {/* ✅ 관절 인식 신호등: 6/6이면 초록, 아니면 빨강 */}
          <Metric
            label="관절 인식"
            value={`${sideCount}/6`}
            dot={sideCount >= 6 ? "#22c55e" : "#ef4444"}
          />
          <Metric
            label="현재"
            value={`${currentReachCm >= 0 ? "+" : ""}${currentReachCm.toFixed(1)} cm`}
          />
          <Metric
            label="최대"
            value={`${bestReachCm >= 0 ? "+" : ""}${bestReachCm.toFixed(1)} cm`}
          />
          {phase === "running" && (
            <Metric label="피크 유지" value={`${holdAtPeakSec}s / 3.0s`} />
          )}
          {phase === "ready" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={pillStyle}>세팅 {readyFrameOk ? "🟢OK" : "🔴조정필요"}</span>
              <span style={pillStyle}>자동시작 {autoStartArmed ? "ON" : "OFF"}</span>
            </div>
          )}
          {phase === "finished" && (
            <span style={pillStyle}>
              최종 {bestReachCm >= 0 ? "+" : ""}
              {bestReachCm.toFixed(1)}cm
            </span>
          )}
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
    background:
      "linear-gradient(180deg, rgba(20,22,30,.95) 0%, rgba(18,20,28,.9) 100%)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 14,
    padding: 12,
    color: "#e5f1ff",
    backdropFilter: "blur(6px)",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  pill: {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 800,
    color: "#0b5cab",
    background: "#dbeafe",
    border: "1px solid #93c5fd",
    padding: "2px 8px",
    borderRadius: 999,
  },
  close: {
    appearance: "none",
    border: "1px solid rgba(255,255,255,.16)",
    background: "transparent",
    color: "#e2e8f0",
    width: 28,
    height: 28,
    borderRadius: 8,
    fontSize: 18,
    lineHeight: "26px",
    textAlign: "center",
    cursor: "pointer",
  },
  title: { marginTop: 8, fontWeight: 800, fontSize: 14, lineHeight: 1.4 },
  imgWrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    marginTop: 10,
    border: "1px solid rgba(255,255,255,.08)",
  },
  img: { width: "100%", display: "block", userSelect: "none" },
  angleBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    background: "#0b5cab",
    color: "#fff",
    fontWeight: 800,
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    boxShadow: "0 6px 14px rgba(11,92,171,.25)",
  },
  caption: {
    position: "absolute",
    bottom: 8,
    right: 8,
    background: "rgba(0,0,0,.55)",
    border: "1px solid rgba(255,255,255,.08)",
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    color: "#e2e8f0",
  },
  list: {
    margin: "10px 0 0",
    padding: "0 0 0 18px",
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 1.5,
  },
  jointBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    background:
      "linear-gradient(180deg, rgba(15,17,24,.9) 0%, rgba(14,16,22,.85) 100%)",
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
