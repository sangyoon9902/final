// src/pages/MeasureStep.jsx
import { useEffect, useRef, useState, useLayoutEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/AppState";
import {
  STEP_STEPPING_SEC,
  STEP_RECOVERY_SEC,
  calcFitnessScore,
  usePulsoidBpm,
} from "../logic/stepLogic";
import { formatMMSS } from "../utils/format";

/* ───────── ECG 파형 함수(컴포넌트 밖) ───────── */
function ecgShape(p) {
  let y = 0;
  if (p > 0.03 && p <= 0.08)  y += Math.sin(((p - 0.03) / 0.05) * Math.PI) * 0.25; // P
  if (p > 0.10 && p <= 0.115) y -= Math.sin(((p - 0.10) / 0.015) * Math.PI) * 1.2;  // Q
  if (p > 0.115 && p <= 0.135) y += Math.sin(((p - 0.115) / 0.02) * Math.PI) * 2.6; // R
  if (p > 0.135 && p <= 0.155) y -= Math.sin(((p - 0.135) / 0.02) * Math.PI) * 1.4; // S
  if (p > 0.22 && p <= 0.36)  y += Math.sin(((p - 0.22) / 0.14) * Math.PI) * 0.6;  // T
  y += (Math.random() - 0.5) * 0.02; // 미세 노이즈
  return y;
}

/* ───────── Pulsoid 프록시 베이스 탐색 유틸 ───────── */
const PULSOID_RELATIVE_KEY = "__relative__";
function normalizeProxyBase(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}
function buildPulsoidProxyBases() {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const normalized = value === PULSOID_RELATIVE_KEY ? "" : normalizeProxyBase(value);
    const key = normalized || PULSOID_RELATIVE_KEY;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  const envBase = normalizeProxyBase(import.meta?.env?.VITE_PULSOID_PROXY ?? "");
  if (envBase) push(envBase);

  if (typeof window !== "undefined") {
    push(PULSOID_RELATIVE_KEY); // 현재 도메인(/api/heart-rate)
    const origin = normalizeProxyBase(window.location?.origin ?? "");
    if (origin) push(origin);
  }

  push("http://localhost:3001"); // 로컬 프록시 후보
  return out.length ? out : ["http://localhost:3001"];
}
function promoteProxyBase(list, base) {
  const normalized = normalizeProxyBase(base ?? "");
  const target = normalized || "";
  const seen = new Set();
  const result = [];
  const add = (value) => {
    const norm = normalizeProxyBase(value ?? "");
    const key = norm || PULSOID_RELATIVE_KEY;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(norm);
  };
  add(target);
  list.forEach(add);
  return result;
}
function buildHeartRateUrl(base) {
  const normalized = normalizeProxyBase(base ?? "");
  return normalized ? `${normalized}/api/heart-rate` : "/api/heart-rate";
}
function describeProxyBase(base) {
  const normalized = normalizeProxyBase(base ?? "");
  if (!normalized) return "현재 도메인(/api/heart-rate)";
  return `${normalized}/api/heart-rate`;
}

/* ───────── 상수 ───────── */
const STEP_AUDIO_SRC = "/audio/step-beat.mp3";
const USE_GUIDED_FLOW = true;
const GUIDE_SEC = 28;

/* ───────── 페이지 컴포넌트 ───────── */
export default function MeasureStep() {
  const nav = useNavigate();
  const { setSession } = useApp();

  // Pulsoid 프록시 후보 리스트 (env → 현재도메인 → origin → localhost)
  const [pulsoidBases, setPulsoidBases] = useState(() => buildPulsoidProxyBases());
  const pulsoidBaseSummary = useMemo(
    () => pulsoidBases.map(describeProxyBase).join(" · "),
    [pulsoidBases]
  );

  const [mode, setMode] = useState("auto");              // 'auto' | 'manual'
  const [phase, setPhase] = useState("idle");            // idle | prestep | stepping | recovery | count10 | count10_done | done
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Pulsoid 연결상태
  const [pulsoidConnected, setPulsoidConnected] = useState(false);
  const [connectStatus, setConnectStatus] = useState("idle"); // idle | connecting | connected | error
  const [connectError, setConnectError] = useState("");

  // HR 폴링 (배열 후보를 전달하면 hook 내부에서 순환/폴백)
  const hrBpm = usePulsoidBpm(pulsoidConnected && mode === "auto", pulsoidBases);
  const lastValidHrRef = useRef(null);
  useEffect(() => { if (Number.isFinite(hrBpm) && hrBpm > 0) lastValidHrRef.current = hrBpm; }, [hrBpm]);

  // 타이머
  const [stepTimer, setStepTimer] = useState(STEP_STEPPING_SEC);
  const [recoveryTimer, setRecoveryTimer] = useState(STEP_RECOVERY_SEC);
  const [count10Timer, setCount10Timer] = useState(10);

  // 결과 입력/계산
  const [restingBpm, setRestingBpm] = useState(null);
  const [manualResting, setManualResting] = useState("");
  const [manualBeats10, setManualBeats10] = useState("");
  const [recoveryAvg, setRecoveryAvg] = useState(null);
  const [stepScore, setStepScore] = useState(null);

  // 오디오
  const stepAudioRef = useRef(null);
  useEffect(() => {
    const a = new Audio(STEP_AUDIO_SRC);
    a.preload = "auto"; a.loop = false; a.volume = 1.0;
    stepAudioRef.current = a;
    return () => { try { a.pause(); a.currentTime = 0; } catch {} };
  }, []);

  // 가이드 흐름
  const guideDriverIdRef = useRef(null);
  const guideStartTsRef = useRef(null);
  const steppedRef = useRef(false);

  function startGuidedFlow() {
    if (!stepAudioRef.current) return;
    if (guideDriverIdRef.current) clearInterval(guideDriverIdRef.current);
    steppedRef.current = false;

    try { stepAudioRef.current.currentTime = 0; stepAudioRef.current.play().catch(()=>{});} catch {}
    guideStartTsRef.current = performance.now();
    setPhase("prestep");

    guideDriverIdRef.current = setInterval(() => {
      const elapsedSec = Math.floor((performance.now() - guideStartTsRef.current) / 1000);

      if (elapsedSec < GUIDE_SEC) { if (phaseRef.current !== "prestep") setPhase("prestep"); }
      if (!steppedRef.current && elapsedSec >= GUIDE_SEC) {
        steppedRef.current = true; setPhase("stepping"); setStepTimer(STEP_STEPPING_SEC);
      }
      if (steppedRef.current && phaseRef.current === "stepping") {
        const measuredSec = elapsedSec - GUIDE_SEC;
        setStepTimer(Math.max(0, STEP_STEPPING_SEC - measuredSec));
      }
      if (elapsedSec >= GUIDE_SEC + STEP_STEPPING_SEC) {
        try { stepAudioRef.current.pause(); stepAudioRef.current.currentTime = 0; } catch {}
        clearInterval(guideDriverIdRef.current); guideDriverIdRef.current = null;
        setPhase("recovery"); setRecoveryTimer(STEP_RECOVERY_SEC);
      }
    }, 200);
  }
  function stopGuidedFlow() {
    if (guideDriverIdRef.current) { clearInterval(guideDriverIdRef.current); guideDriverIdRef.current = null; }
    try { stepAudioRef.current?.pause(); if (stepAudioRef.current) stepAudioRef.current.currentTime = 0; } catch {}
  }

  // 비가이드 타이머
  useEffect(() => {
    if (USE_GUIDED_FLOW) return;
    if (phase !== "stepping") return;
    if (stepTimer <= 0) { setPhase("recovery"); setRecoveryTimer(STEP_RECOVERY_SEC); return; }
    const id = setTimeout(() => setStepTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, stepTimer]);

  // 회복 → 자동/수동 분기
  useEffect(() => {
    if (phase !== "recovery") return;
    if (recoveryTimer <= 0) {
      if (mode === "auto") {
        const hrAt1min = Number.isFinite(lastValidHrRef.current) ? lastValidHrRef.current : null;
        finishWithBpm(hrAt1min);
      } else {
        setManualBeats10(""); setCount10Timer(10); setPhase("count10");
      }
      return;
    }
    const id = setTimeout(() => setRecoveryTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, recoveryTimer, mode]);

  // 수동 10초 타이머
  useEffect(() => {
    if (phase !== "count10") return;
    if (count10Timer <= 0) { setPhase("count10_done"); return; }
    const id = setTimeout(() => setCount10Timer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, count10Timer]);

  // 결과 저장
  function finishWithBpm(bpmVal) {
    const scoreObj = calcFitnessScore(bpmVal);
    setRecoveryAvg(bpmVal); setStepScore(scoreObj);
    setSession(prev => ({
      ...prev,
      step: {
        ...(prev.step ?? {}),
        restingBpm: restingBpm ?? prev.step?.restingBpm ?? null,
        recoveryAvg: bpmVal,
        vo2max: scoreObj?.vo2max ?? null,
        grade: scoreObj?.grade ?? null,
        gradeDesc: scoreObj?.desc ?? null,
        measuredAt: new Date().toISOString(),
      },
    }));
    setPhase("done");
  }

  // 연결(여러 프록시 후보 순차 시도)
  async function handleConnectPulsoid() {
    setConnectStatus("connecting"); setConnectError(""); setPulsoidConnected(false);
    const errorDetails = [];
    for (const base of pulsoidBases) {
      const url = buildHeartRateUrl(base);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        const bpm = Number(data?.bpm ?? data?.heart_rate ?? data?.value);
        setPulsoidConnected(true);
        setConnectStatus("connected");
        setConnectError("");
        setPulsoidBases(prev => promoteProxyBase(prev, base)); // 성공한 베이스를 맨 앞으로
        if (Number.isFinite(bpm) && bpm > 0) lastValidHrRef.current = bpm;
        return;
      } catch (e) {
        clearTimeout(t);
        const reason = e?.name === "AbortError" ? "시간 초과" : (e?.message || "네트워크 오류");
        errorDetails.push(`${describeProxyBase(base)} → ${reason}`);
      }
    }
    setPulsoidConnected(false);
    setConnectStatus("error");
    setConnectError(`연결 실패: Pulsoid 프록시 확인 (${errorDetails.join(" | ") || pulsoidBaseSummary})`);
    console.warn("Pulsoid connect failed", errorDetails);
  }

  function handleStartStep() {
    const startRest = mode === "auto"
      ? (Number.isFinite(hrBpm) ? hrBpm : null)
      : (Number.isFinite(parseFloat(manualResting)) ? parseFloat(manualResting) : null);
    if (!Number.isFinite(startRest) || startRest <= 0 || startRest > 100) return;
    setRestingBpm(startRest);
    setSession(prev => ({ ...prev, step: { ...(prev.step ?? {}), restingBpm: startRest } }));
    setRecoveryAvg(null); setStepScore(null); setManualBeats10("");
    setStepTimer(STEP_STEPPING_SEC); setRecoveryTimer(STEP_RECOVERY_SEC);
    if (USE_GUIDED_FLOW) startGuidedFlow();
    else { try { stepAudioRef.current.currentTime = 0; stepAudioRef.current.play().catch(()=>{});} catch {} ; setPhase("stepping"); }
  }

  function handleReset() {
    if (USE_GUIDED_FLOW) stopGuidedFlow();
    else { try { stepAudioRef.current?.pause(); stepAudioRef.current.currentTime = 0; } catch {} }
    setPulsoidConnected(false); setConnectStatus("idle"); setConnectError("");
    setRestingBpm(null); setManualResting(""); setManualBeats10("");
    setRecoveryAvg(null); setStepScore(null);
    setStepTimer(STEP_STEPPING_SEC); setRecoveryTimer(STEP_RECOVERY_SEC);
    setCount10Timer(10); setPhase("idle");
  }

  function handleBackToSelect() {
    const vo2 = Number.isFinite(stepScore?.vo2max) ? Number(stepScore.vo2max).toFixed(1) : null;
    const rec = Number.isFinite(recoveryAvg) ? Math.round(recoveryAvg) : null;
    const state = (phaseRef.current === "done" && (vo2 || rec !== null))
      ? { justFinished: { test: "step", summary: [rec!==null?`회복 ${rec} bpm`:null, vo2?`VO₂max ${vo2}`:null].filter(Boolean).join(", ") } }
      : undefined;
    nav("/select", { state });
  }

  const canStart = mode === "auto"
    ? pulsoidConnected && Number.isFinite(hrBpm) && hrBpm > 0 && hrBpm <= 100
    : (Number.isFinite(parseFloat(manualResting)) && parseFloat(manualResting) > 0 && parseFloat(manualResting) <= 100);
  const canSubmitBeats = Number.isFinite(parseInt(manualBeats10, 10)) && parseInt(manualBeats10, 10) > 0;

  return (
    <div style={{ padding:"16px", color:"#fff", background:"#000", minHeight:"100vh", overflowX:"hidden" }}>
      {connectStatus === "error" && (
        <div style={{ background:"#3a1120", border:"1px solid #a23", padding:8, borderRadius:8, marginBottom:8 }}>
          ⚠️ {connectError}
        </div>
      )}

      <FlowRibbon
        phase={phase}
        mode={mode}
        stepTimer={stepTimer}
        recoveryTimer={recoveryTimer}
        count10Timer={count10Timer}
      />

      <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginBottom:12, fontSize:12 }}>
        <Pill>모드 {mode==="auto"?"자동":"수동"}</Pill>
        <Pill>현재 HR {Number.isFinite(hrBpm)?`${hrBpm} bpm`:"--"}</Pill>
        {Number.isFinite(restingBpm) && <Pill>안정심박 {restingBpm} bpm</Pill>}
        {phase === "done" && (
          <>
            <Pill>회복 기록 {recoveryAvg!=null?`${Math.round(recoveryAvg)} bpm`:"--"}</Pill>
            {Number.isFinite(stepScore?.vo2max) && <Pill>VO₂max {Number(stepScore.vo2max).toFixed(1)}</Pill>}
          </>
        )}
      </div>

      {mode === "auto" && (
        <Heartline bpm={Number.isFinite(hrBpm) ? hrBpm : null} connected={pulsoidConnected} />
      )}

      <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
        {phase === "idle" && (
          <>
            <Pill>
              모드:{" "}
              <select value={mode} onChange={e=>setMode(e.target.value)} style={{ background:"transparent", color:"#fff", border:"none" }}>
                <option value="auto">자동(워치연결)</option>
                <option value="manual">수동 입력</option>
              </select>
            </Pill>

            <Button
              bg={mode!=="auto" ? "#333" : connectStatus==="connected" ? "#2d6" : connectStatus==="connecting" ? "#777" : "#555"}
              onClick={mode==="auto" ? handleConnectPulsoid : undefined}
              disabled={mode!=="auto" || connectStatus==="connecting"}
            >
              {mode!=="auto" && "수동 모드"}
              {mode==="auto" && connectStatus==="idle" && "워치 연결"}
              {mode==="auto" && connectStatus==="connecting" && "연결 중..."}
              {mode==="auto" && connectStatus==="connected" && "워치 연결됨 ✅"}
              {mode==="auto" && connectStatus==="error" && "연결 실패(다시 시도)"}
            </Button>

            {mode==="manual" && (
              <input
                type="number"
                value={manualResting}
                onChange={e=>setManualResting(e.target.value)}
                placeholder="안정심박 (100bpm 이하)"
                style={{ background:"#111", color:"#fff", border:"1px solid #444", borderRadius:8, padding:"8px 10px", width:150 }}
              />
            )}

            <Button bg={canStart ? "#28a" : "#444"} disabled={!canStart} onClick={handleStartStep}>
              스텝검사 시작
            </Button>
          </>
        )}

        {(phase==="prestep" || phase==="stepping" || phase==="recovery" || phase==="count10" || phase==="count10_done") && (
          <Button bg="#a33" onClick={handleReset}>중단 / 리셋</Button>
        )}

        {(phase === "count10" || phase === "count10_done") && (
          <>
            <input
              type="number"
              value={manualBeats10}
              onChange={e=>setManualBeats10(e.target.value)}
              placeholder="10초간 박동 수 입력"
              style={{ background:"#111", color:"#fff", border:"1px solid #444", borderRadius:8, padding:"8px 10px", width:160 }}
            />
            <Button bg={canSubmitBeats ? "#28a" : "#444"} disabled={!canSubmitBeats} onClick={() => {
              const beats = parseInt(manualBeats10, 10); if (!Number.isFinite(beats) || beats <= 0) return;
              finishWithBpm(beats * 6);
            }}>
              입력 완료
            </Button>
          </>
        )}

        {phase === "done" && <></>}
        <Button bg="#444" onClick={handleBackToSelect}>종목 선택으로</Button>
      </div>
    </div>
  );
}

/* ───────── Heartline: 캔버스 ECG 스타일 (연결 없어도 직선 파형 유지) ───────── */
function Heartline({ bpm, connected }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const dpr = Math.max(1, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

  const samplesRef = useRef([]);
  const capacityRef = useRef(0);
  const phaseRef = useRef(0);
  const lastTsRef = useRef(0);
  const bpmRef = useRef(bpm || 60);
  useEffect(() => { if (Number.isFinite(bpm) && bpm > 0) bpmRef.current = bpm; }, [bpm]);

  useLayoutEffect(() => {
    function resize() {
      const cvs = canvasRef.current; const box = wrapRef.current?.getBoundingClientRect?.();
      if (!cvs || !box) return;

      const wCss = Math.max(320, Math.round(box.width));
      const hCss = 160;

      const curW = parseInt(cvs.style.width || "0", 10);
      const curH = parseInt(cvs.style.height || "0", 10);
      if (curW === wCss && curH === hCss) return;

      const w = Math.floor(wCss * dpr), h = Math.floor(hCss * dpr);
      cvs.width = w; cvs.height = h;
      cvs.style.width = `${wCss}px`; cvs.style.height = `${hCss}px`;

      const nextCap = Math.floor(w);
      if (capacityRef.current !== nextCap) {
        capacityRef.current = nextCap;
        samplesRef.current = new Array(nextCap).fill(h / 2);
      }
    }
    resize();
    let raf;
    let ro;

    const hasResizeObserver = typeof ResizeObserver !== "undefined";
    if (hasResizeObserver) {
      ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(resize); });
      if (wrapRef.current) ro.observe(wrapRef.current);
    }
    window.addEventListener("resize", resize);

    return () => {
      if (hasResizeObserver) ro?.disconnect();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, [dpr]);

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    const ctx = cvs.getContext("2d"); ctx.lineJoin = "round"; ctx.lineCap = "round";

    function loop(ts) {
      const now = ts || performance.now();
      const last = lastTsRef.current || now;
      const dt = Math.min(0.060, (now - last) / 1000);
      lastTsRef.current = now;

      const targetBpm = Math.min(220, Math.max(30, bpmRef.current || 60));
      const beatInterval = 60 / targetBpm;
      const speed = dt / beatInterval;

      const W = cvs.width, H = cvs.height;
      const baseline = (H / dpr) * 0.5;
      const arr = samplesRef.current;

      if (connected && Number.isFinite(targetBpm)) {
        phaseRef.current += speed; if (phaseRef.current >= 1) phaseRef.current -= 1;
        const amp = (H / dpr) * 0.28;
        const y = baseline - ecgShape(phaseRef.current) * amp;
        if (arr.length >= capacityRef.current && arr.length > 0) { arr.shift(); arr.push(y); }
      } else {
        const tiny = (Math.random() - 0.5) * (H / dpr) * 0.008; // 거의 직선
        const y = baseline + tiny;
        if (arr.length >= capacityRef.current && arr.length > 0) { arr.shift(); arr.push(y); }
      }

      // 배경/그리드
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0b0f1d"; ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
      ctx.beginPath();
      const gridStep = 16 * dpr;
      for (let x = 0; x < W; x += gridStep) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = 0; y < H; y += gridStep) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();

      // 중앙선
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); const mid = Math.floor(H / 2) + 0.5; ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

      // 파형
      if (arr.length > 1) {
        ctx.strokeStyle = connected ? "#70e1c8" : "rgba(112,225,200,0.75)";
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); const leftPad = 6 * dpr;
        for (let i = 0; i < arr.length; i++) {
          const x = leftPad + i;
          const y = Math.max(0, Math.min(H - 1, Math.round(arr[i] * dpr)));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        const yy = Math.max(0, Math.min(H - 1, Math.round(arr[arr.length - 1] * dpr)));
        ctx.fillStyle = connected ? "#9bf1dd" : "rgba(155,241,221,0.9)";
        ctx.beginPath(); ctx.arc(W - 8 * dpr, yy, 3.2 * dpr, 0, Math.PI * 2); ctx.fill();
      }

      // 연결 안됨 오버레이
      if (!connected) {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(0, 0, W, H);
      }

      // 라벨/수치
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `${12 * dpr}px system-ui,-apple-system,Segoe UI,Roboto,Noto Sans KR,sans-serif`;
      ctx.fillText("실시간 심박", 12 * dpr, 20 * dpr);

      ctx.fillStyle = "white";
      ctx.font = `bold ${22 * dpr}px system-ui,-apple-system,Segoe UI,Roboto,Noto Sans KR,sans-serif`;
      const txt = Number.isFinite(bpm) ? `${Math.round(bpm)} bpm` : (connected ? "-- bpm" : "");
      ctx.fillText(txt, 12 * dpr, H - 14 * dpr);

      if (!connected) {
        ctx.fillStyle = "#ffd4d4";
        ctx.font = `600 ${14 * dpr}px system-ui,-apple-system,Segoe UI,Roboto,Noto Sans KR,sans-serif`;
        ctx.fillText("워치를 연결하거나 Pulsoid 앱을 켜주세요", 12 * dpr, 40 * dpr);
      }

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [connected, dpr, bpm]);

  return (
    <div
      ref={wrapRef}
      style={{
        marginBottom: 14,
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(10,14,28,0.95), rgba(6,10,22,0.95))",
        boxShadow: "0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        minHeight: 180,
        boxSizing: "border-box",
        contain: "layout size style paint",
        isolation: "isolate",
        overflowAnchor: "none",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} />
    </div>
  );
}

/* ───────── 리본 UI ───────── */
function FlowRibbon({ phase, mode, stepTimer, recoveryTimer, count10Timer }) {
  const base = [
    { id: "connect", label: "연결/입력" },
    { id: "guide", label: "안내" },
    { id: "stepping", label: "3분 스텝검사" },
    { id: "rest", label: "1분 휴식" },
  ];
  const tail = mode === "manual"
    ? { id: "manual", label: "10초 심박수 측정" }
    : { id: "auto", label: "심박수 자동 측정" };
  const steps = [...base, tail];

  const currentId =
    phase === "idle" ? "connect" :
    phase === "prestep" ? "guide" :
    phase === "stepping" ? "stepping" :
    phase === "recovery" ? "rest" :
    phase === "count10" ? "manual" :
    phase === "count10_done" ? "manual" :
    phase === "done" ? (mode === "manual" ? "manual" : "auto")
                      : "connect";

  const idx = Math.max(0, steps.findIndex(s => s.id === currentId));
  const fill = Math.min(1, (idx + 0.5) / steps.length);

  const rightText =
    phase === "idle" ? "준비되면 ‘스텝검사 시작’을 눌러주세요" :
    phase === "prestep" ? "안내 중…" :
    phase === "stepping" ? `스텝 남은 시간 ${formatMMSS(stepTimer)}` :
    phase === "recovery" ? `휴식 남은 시간 ${formatMMSS(recoveryTimer)}` :
    (mode === "manual" && phase === "count10") ? `10초 카운트 남은 00:${String(count10Timer).padStart(2,"0")}` :
    (mode === "manual" && phase === "count10_done") ? "방금 센 박동 수를 입력해주세요" :
    phase === "done" ? "측정 완료 ✅" : "";

  return (
    <div style={{ marginBottom:12, width:"100%", maxWidth:"100%", overflow:"hidden", boxSizing:"border-box" }}>
      <div style={{
        position:"relative",
        borderRadius:14,
        padding:"14px 18px",
        background:"linear-gradient(180deg, rgba(18,18,22,0.95), rgba(10,10,12,0.9))",
        border:"1px solid rgba(255,255,255,0.10)",
        boxShadow:"0 12px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)"
      }}>
        {/* 헤더 */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:16, fontWeight:800, color:"#eaeefb" }}>스텝검사 진행</span>
            <span style={{
              fontSize:12, fontWeight:700, padding:"6px 10px", borderRadius:999,
              background:"rgba(80,120,255,0.18)", border:"1px solid rgba(120,160,255,0.35)", color:"#cdd7ff"
            }}>
              {mode === "auto" ? "자동모드" : "수동모드"}
            </span>
          </div>
          <span style={{ fontSize:12, opacity:0.85 }}>{rightText}</span>
        </div>

        {/* 진행 트랙 */}
        <div style={{ position:"relative", padding:"10px 0 4px", overflow:"hidden" }}>
          {/* 베이스 라인 */}
          <div style={{
            position:"absolute", left:8, right:8, top:"50%",
            height:4, transform:"translateY(-50%)",
            background:"rgba(255,255,255,0.08)", borderRadius:4
          }} />
          {/* 채움 라인 (scaleX) */}
          <div style={{
            position:"absolute", left:8, right:8, top:"50%",
            height:4, transform:`translateY(-50%) scaleX(${fill})`,
            transformOrigin:"left center",
            background:"linear-gradient(90deg, #60a5fa, #34d399)",
            boxShadow:"0 0 14px rgba(56,189,248,0.35)",
            borderRadius:4,
            transition:"transform 180ms ease",
            willChange:"transform"
          }} />

          {/* 노드 */}
          <div style={{ display:"grid", gridTemplateColumns:`repeat(${steps.length}, 1fr)`, gap:0, position:"relative", padding:"0 8px" }}>
            {steps.map((s, i) => {
              const active = i <= idx;
              const current = i === idx;
              return (
                <div key={s.id} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, minWidth:0 }}>
                  <div style={{
                    width: current ? 18 : 14, height: current ? 18 : 14, borderRadius:"50%",
                    background: active ? "linear-gradient(180deg, #60a5fa, #34d399)" : "rgba(255,255,255,0.15)",
                    border: active ? "0" : "1px solid rgba(255,255,255,0.25)",
                    boxShadow: active ? "0 0 12px rgba(99,102,241,0.45)" : "none",
                    transition:"all 250ms ease", flex:"0 0 auto"
                  }} />
                  <div style={{
                    fontSize: current ? 13 : 12, fontWeight: current ? 800 : 600,
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

/* ───────── 간단 UI ───────── */
function Pill({children}) {
  return (
    <span style={{ background:"#1a1a2a", border:"1px solid #444", borderRadius:"999px", padding:"6px 10px", fontSize:12 }}>
      {children}
    </span>
  );
}
function Button({bg,onClick,children,disabled}) {
  return (
    <button
      style={{ background:bg, opacity:disabled?0.4:1, color:"#fff", border:"none", borderRadius:10, padding:"10px 14px", fontSize:14, fontWeight:600, minWidth:120, cursor:"pointer" }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
