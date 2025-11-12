// src/logic/stepLogic.js
export const STEP_STEPPING_SEC = 180;
export const STEP_RECOVERY_SEC = 60;

export function calcFitnessScore(recovery1minBPM) {
  if (!Number.isFinite(recovery1minBPM)) return null;

  // (임시) 간단 등급 컷
  let out;
  if (recovery1minBPM < 90) out = { grade: 1, desc: "매우 우수" };
  else if (recovery1minBPM < 100) out = { grade: 2, desc: "우수" };
  else if (recovery1minBPM < 110) out = { grade: 3, desc: "보통" };
  else if (recovery1minBPM < 120) out = { grade: 4, desc: "보통 이하" };
  else if (recovery1minBPM < 130) out = { grade: 5, desc: "부족" };
  else out = { grade: 6, desc: "매우 부족" };

  // (임시) 단순 VO2max 추정: 낮을수록 높다고 가정
  const vo2max = Math.max(20, Math.min(70, 80 - 0.4 * recovery1minBPM));
  return { ...out, vo2max: Number(vo2max.toFixed(1)) };
}

// ─────────────────────────────────────────────
// 심박 폴링 훅 (토큰 불필요, 프록시만 호출)
// 사용법: const bpm = usePulsoidBpm(enabled, apiBaseOrList);
// ─────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";

function normaliseBases(apiBase) {
  const arr = Array.isArray(apiBase) ? apiBase : [apiBase];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const norm = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
    const key = norm || "__relative__";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
  }
  return out.length ? out : ["http://localhost:3001"];
}

function buildHrUrl(base) {
  const norm = typeof base === "string" ? base : "";
  return norm ? `${norm}/api/heart-rate` : "/api/heart-rate";
}

export function usePulsoidBpm(enabled, apiBase = ["http://localhost:3001"]) {
  const [bpm, setBpm] = useState(null);
  const timerRef = useRef(null);
  const aliveRef = useRef(true);
  const basesRef = useRef(normaliseBases(apiBase));
  const baseIndexRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;

    basesRef.current = normaliseBases(apiBase);
    if (baseIndexRef.current >= basesRef.current.length) {
      baseIndexRef.current = 0;
    }

    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      setBpm(null);
      return () => { aliveRef.current = false; };
    }

    if (timerRef.current) clearInterval(timerRef.current);

    async function tick() {
      const bases = basesRef.current;
      if (!bases.length) return;
      const startIdx = baseIndexRef.current;

      try {
        for (let step = 0; step < bases.length; step += 1) {
          const idx = (startIdx + step) % bases.length;
          const base = bases[idx];
          try {
            const res = await fetch(buildHrUrl(base), { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const vRaw = data?.heart_rate ?? data?.bpm ?? data?.value ?? data?.data?.heart_rate ?? null;
            const v = Number(vRaw);
            baseIndexRef.current = idx;
            if (aliveRef.current && Number.isFinite(v) && v > 0) {
              setBpm(v);
            }
            break;
          } catch (innerError) {
            baseIndexRef.current = (idx + 1) % bases.length;
          }
        }
      } catch {}
    }

    // 즉시 1회, 이후 1초 폴링
    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, apiBase]);

  return bpm;
}
