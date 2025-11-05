// src/api/session.js

const DEFAULT_HOST =
  typeof window !== "undefined" ? window.location.hostname : "localhost";

export const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  `http://${DEFAULT_HOST}:8080`;

// 빈 문자열을 null로 치환 (방어적)
function normalizeMeasurements(measurements = {}) {
  const out = { ...measurements };
  for (const k of Object.keys(out)) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out;
}

/**
 * 서버 응답에서 plan/evidence/traceId를 유연하게 추출
 */
function extractResponse(data) {
  // plan 텍스트 후보들
  const planMd =
    data?.planMd ??
    data?.plan_markdown ??
    data?.plan ??
    data?.planText?.planText ??
    data?.planText?.content ??
    "";

  // evidence 후보들
  const evidence =
    (Array.isArray(data?.evidence) && data.evidence) ||
    (Array.isArray(data?.meta?.evidence) && data.meta.evidence) ||
    [];

  // traceId 후보들
  const traceId =
    data?.trace_id ??
    data?.traceId ??
    data?.meta?.trace_id ??
    data?.meta?.traceId ??
    "";

  return { planMd, evidence, traceId };
}

/**
 * 정규화된 페이로드(user/measurements/surveys) 전송
 * @returns {Promise<{ planMd: string, evidence: Array, traceId: string, raw: any }>}
 */
export async function sendSessionSummary({ user, measurements, surveys, signal }) {
  const url = `${API_BASE}/session_summary`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user,
      measurements: normalizeMeasurements(measurements),
      surveys,
    }),
    signal,
  });

  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    const detail = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`HTTP ${resp.status} ${detail}`);
  }

  const { planMd, evidence, traceId } = extractResponse(data);

  return { planMd, evidence, traceId, raw: data };
}
