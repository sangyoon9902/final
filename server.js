// server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PULSOID_TOKEN = (process.env.PULSOID_TOKEN || "").trim();
const PULSOID_API_URL =
  (process.env.PULSOID_API_URL || "https://dev.pulsoid.net/api/v1/data/heart_rate/latest").trim() ||
  "https://dev.pulsoid.net/api/v1/data/heart_rate/latest";

// 간단 요청 로그 (디버깅용)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/api/heart-rate", async (_req, res) => {
  // 항상 캐시 금지 → 프론트가 최신 상태 반영
  res.setHeader("Cache-Control", "no-store");

  // 공통: 안전 응답 함수 (파형을 직선으로라도 유지)
  const safeReturn = (extra = {}) =>
    res.status(200).json({
      heart_rate: null,         // null → 프론트에서 "직선 파형" 유지 가능
      measured_at: Date.now(),
      _proxy: "v1_flat",
      _note: "fallback",
      ...extra,
    });

  try {
    // ① Pulsoid 토큰이 없으면 바로 fallback
    if (!PULSOID_TOKEN) {
      console.warn("Pulsoid token missing → returning fallback");
      return safeReturn({ reason: "missing_token" });
    }

    // ② fetch 타임아웃(3초) 적용
    const controller = new AbortController();
    const tm = setTimeout(() => controller.abort(), 3000);

    const r = await fetch(PULSOID_API_URL, {
      headers: { Authorization: `Bearer ${PULSOID_TOKEN}` },
      signal: controller.signal,
    }).catch((e) => {
      console.error("Pulsoid fetch error:", e);
      return null;
    });
    clearTimeout(tm);

    // 네트워크 실패 → fallback
    if (!r) return safeReturn({ reason: "network_error" });

    const rawTxt = await r.text();
    // HTTP 에러 → 그래도 200으로 fallback (파형 유지)
    if (!r.ok) {
      console.warn("Pulsoid HTTP error:", r.status, rawTxt?.slice?.(0, 120));
      return safeReturn({ reason: `http_${r.status}` });
    }

    // 본문 파싱
    let raw = {};
    try { raw = JSON.parse(rawTxt); } catch {}

    const bpm =
      raw?.bpm ??
      raw?.heart_rate ??
      raw?.value ??
      raw?.data?.heart_rate ??
      null;

    const measured_at = raw?.measured_at ?? raw?.timestamp ?? Date.now();

    // ③ BPM이 유효하지 않아도 200 + null (직선 파형)
    if (!Number.isFinite(bpm) || bpm <= 0) {
      return safeReturn({ reason: "invalid_bpm", raw_sample: rawTxt?.slice?.(0, 120) });
    }

    // 정상 응답
    return res.json({ heart_rate: bpm, measured_at, _proxy: "v1_flat" });
  } catch (e) {
    console.error("Pulsoid fetch error:", e);
    // ④ 예외 발생에도 200 + null (끊김 없는 파형)
    return safeReturn({ reason: "exception" });
  }
});

const PORT = 3001; // (요청대로: 다른 건 바꾸지 않음)
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Proxy server running on http://localhost:${PORT}`)
);
