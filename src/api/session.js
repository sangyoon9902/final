// src/api/session.js

// 1) 운영 주소: Render 등 실제 백엔드 URL을 환경변수로 고정
const ENV_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) || "";

// 2) 로컬 개발 기본값
const LOCAL_BASE = "http://localhost:8080";

// 3) 호스트 기반 자동 추론(로컬만)
function detectBase() {
  if (typeof window === "undefined") return LOCAL_BASE;
  const host = window.location.hostname;

  // 로컬 개발
  if (host === "localhost" || host === "127.0.0.1") return LOCAL_BASE;

  // 그 외(배포)에서는 반드시 ENV_BASE를 쓰도록 강제
  // (Vercel 도메인에 :8080 붙는 사고를 차단)
  return ENV_BASE || LOCAL_BASE; // ENV 미설정 시에도 최소 로컬로 폴백
}

export const API_BASE = ENV_BASE || detectBase();

// ──────────────────────────────────────────────────────────
// 이하 기존 로직 동일
function normalizeMeasurements(measurements = {}) {
  const out = { ...measurements };
  for (const k of Object.keys(out)) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out;
}

function extractResponse(data) {
  const planMd =
    data?.planMd ??
    data?.plan_markdown ??
    data?.plan ??
    data?.planText?.planText ??
    data?.planText?.content ??
    "";
  const evidence =
    (Array.isArray(data?.evidence) && data.evidence) ||
    (Array.isArray(data?.meta?.evidence) && data.meta.evidence) ||
    [];
  const traceId =
    data?.trace_id ?? data?.traceId ?? data?.meta?.trace_id ?? data?.meta?.traceId ?? "";
  return { planMd, evidence, traceId };
}

export async function sendSessionSummary({ user, measurements, surveys, signal }) {
  const url = `${API_BASE}/session_summary`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, measurements: normalizeMeasurements(measurements), surveys }),
    signal,
  });

  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!resp.ok) {
    const detail = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`HTTP ${resp.status} ${detail}`);
  }
  const { planMd, evidence, traceId } = extractResponse(data);
  return { planMd, evidence, traceId, raw: data };
}
