// src/api/review.js
const DB_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DB_API_BASE) ||
  "http://localhost:8098";

/**
 * 리스트 조회
 * - page, size, q(부분검색)
 * - id, traceId(정확 매칭 우선)
 * - userId(서버가 지원하면 정확 매칭)
 */
export async function listResults({ page = 1, size = 50, q = "", userId, id, traceId } = {}) {
  const url = new URL("/api/results", DB_BASE);
  url.searchParams.set("page", page);
  url.searchParams.set("size", size);
  if (q) url.searchParams.set("q", q);
  if (userId) url.searchParams.set("userId", userId);
  if (id) url.searchParams.set("id", id);
  if (traceId) url.searchParams.set("traceId", traceId);

  const r = await fetch(url);
  if (!r.ok) throw new Error("listResults failed");
  return r.json();
}

export async function getResult(idOrTrace) {
  const r = await fetch(`${DB_BASE}/api/results/${encodeURIComponent(idOrTrace)}`);
  if (!r.ok) throw new Error("getResult failed");
  return r.json();
}

export async function patchResult(id, payload) {
  // planMd/plan_md 동시 호환
  const merged = {
    ...(payload ?? {}),
    ...(payload?.planMd != null ? { plan_md: payload.planMd } : {}),
    ...(payload?.plan_md != null ? { planMd: payload.plan_md } : {}),
  };

  const r = await fetch(`${DB_BASE}/api/results/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data?.detail || "patchResult failed");
  }
  return data;
}
