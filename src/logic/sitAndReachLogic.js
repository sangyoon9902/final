// src/logic/sitAndReachLogic.js

// Mediapipe pose indices
export const IDX = {
  NOSE: 0,
  L_SH: 11,
  R_SH: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_INDEX: 19,   // 손끝(검지)
  R_INDEX: 20,   // 손끝(검지)
  L_HIP: 23,
  R_HIP: 24,
  L_ANK: 27,     // 발목 (측정에는 사용 안 함)
  R_ANK: 28,     // 발목 (측정에는 사용 안 함)
  L_FOOT: 31,    // 발끝
  R_FOOT: 32,    // 발끝
};

// ─────────────────────────────────────────────────────────────
// Yaw 계산 (정면≈0°, 측면≈90°)
// ─────────────────────────────────────────────────────────────
export function estimateYawDeg(lms) {
  const Ls = lms?.[IDX.L_SH], Rs = lms?.[IDX.R_SH];
  const Lh = lms?.[IDX.L_HIP], Rh = lms?.[IDX.R_HIP];
  const useShoulder = Ls && Rs && (Ls.visibility ?? 0) + (Rs.visibility ?? 0) >= 0.8;
  const A = useShoulder ? Ls : Lh;
  const B = useShoulder ? Rs : Rh;
  if (!A || !B) return NaN;
  const dx = Math.abs((B.x ?? 0) - (A.x ?? 0));
  const dz = Math.abs((B.z ?? 0) - (A.z ?? 0));
  return (Math.atan2(dz, Math.max(1e-6, dx)) * 180) / Math.PI;
}

// 각도만 엄격: 85~95°
export function angleOKForReach(yaw, yawMin = 85, yawMax = 95) {
  return Number.isFinite(yaw) && yaw >= yawMin && yaw <= yawMax;
}

// ─────────────────────────────────────────────────────────────
// 사이드(Left/Right) 선택: **손끝/발끝/엉덩이** 가시성으로만 선택
// ─────────────────────────────────────────────────────────────
function vis(p) { return (p?.visibility ?? 0); }

export function chooseDominantSide(lms) {
  if (!lms?.length) return { side: null, scoreL: 0, scoreR: 0 };

  const scoreL = vis(lms[IDX.L_INDEX]) + vis(lms[IDX.L_FOOT]) + vis(lms[IDX.L_HIP]);
  const scoreR = vis(lms[IDX.R_INDEX]) + vis(lms[IDX.R_FOOT]) + vis(lms[IDX.R_HIP]);

  const side = (scoreL === 0 && scoreR === 0) ? null : (scoreL >= scoreR ? "L" : "R");
  return { side, scoreL, scoreR };
}

// ─────────────────────────────────────────────────────────────
// 발끝 X 앵커(히스테리시스: 근접 시 락인, 멀어지면 해제)
//  - lockInNearCm: 이 값 '이상'(>=)이면 손이 발끝 근처 → 고정 시작
//  - releaseFarCm: 이 값 '이하'(<=)이면 손이 다시 멀어짐 → 고정 해제
//  - maxAgeMs: 고정값을 너무 오래 끌고가지 않도록 안전 갱신
// ─────────────────────────────────────────────────────────────
const FOOT_VIS_TH = 0.45;

function makeFootAnchor({
  lockInNearCm = -20,
  releaseFarCm = -30,
  maxAgeMs = 5000,
} = {}) {
  const state = {
    L: { locked:false, x:null, ts:0 },
    R: { locked:false, x:null, ts:0 },
  };

  function valueFor(side, footP) {
    const s = state[side];
    if (s.locked && Number.isFinite(s.x)) return s.x;
    return footP?.x ?? null;
    // 주의: locked가 아니면 항상 최신 관측값 사용
  }

  function update(side, { cmCandidate, footP }) {
    const s = state[side];
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    // 🔒 Lock-in: 손이 근접 구간(>= lockInNearCm)이고 발끝이 보이는 프레임이면 고정
    if (!s.locked && cmCandidate >= lockInNearCm && footP && (footP.visibility ?? 0) >= FOOT_VIS_TH) {
      s.locked = true; s.x = footP.x; s.ts = now; return;
    }

    // 🔓 Release: 손이 충분히 멀어진 구간(<= releaseFarCm)이면 해제
    if (s.locked && cmCandidate <= releaseFarCm) {
      s.locked = false; s.x = null; s.ts = 0; return;
    }

    // 안전 갱신: 너무 오래 고정되었고, 발끝이 충분히 보이면 고정 좌표 업데이트
    if (s.locked && (now - s.ts > maxAgeMs) && footP && (footP.visibility ?? 0) >= FOOT_VIS_TH) {
      s.x = footP.x; s.ts = now;
    }
  }

  function isAnchored(side) {
    return !!state[side]?.locked;
  }

  function reset() {
    state.L = { locked:false, x:null, ts:0 };
    state.R = { locked:false, x:null, ts:0 };
  }

  return { valueFor, update, isAnchored, reset };
}

// 모듈 생애주기 동안 유지되는 싱글톤 앵커
export const footAnchor = makeFootAnchor();

// ─────────────────────────────────────────────────────────────
/**
 * [한쪽 사이드만] 좌전굴 "전방 X 성분"(부호 포함, cm) 계산
 *  + : 손끝이 발끝 "넘김", 0 : "닿음", - : "못 미침"
 *  - 출력: { cm, side, ok, anchored }
 *  - 조건:
 *     - 손끝(검지)은 visibility ≥ 0.45 필요
 *     - 발끝은 "보이거나(visibility OK) 또는 앵커 ON"이면 OK
 */
// ─────────────────────────────────────────────────────────────
export function estimateForwardReachSignedCmX_oneSide(lms, userHeightCm = 170) {
  if (!lms?.length || !Number.isFinite(userHeightCm) || userHeightCm <= 0) {
    return { cm: 0, side: null, ok: false, anchored: false };
  }

  const { side } = chooseDominantSide(lms);
  if (!side) return { cm: 0, side: null, ok: false, anchored: false };

  const HAND = (side === "L") ? IDX.L_INDEX : IDX.R_INDEX; // 손끝만
  const FOOT = (side === "L") ? IDX.L_FOOT  : IDX.R_FOOT;  // 발끝만
  const HIP  = (side === "L") ? IDX.L_HIP   : IDX.R_HIP;

  const handP = lms[HAND];
  const footP = lms[FOOT];
  const hipP  = lms[HIP];

  // 손은 반드시 보이고 좌표 존재
  if (!handP || (handP.visibility ?? 0) < 0.45 || handP.x == null) {
    return { cm: 0, side, ok: false, anchored: false };
  }
  if (!hipP || hipP.x == null) {
    return { cm: 0, side, ok: false, anchored: false };
  }

  // 1) 현재 관측 발끝(or 기존 앵커)로 임시 cm 산출
  const rawFootX = (footP && footP.x != null) ? footP.x : null;
  const preFootX = rawFootX ?? footAnchor.valueFor(side, footP);
  if (preFootX == null) return { cm: 0, side, ok: false, anchored: footAnchor.isAnchored(side) };

  const dir_pre = Math.sign(((preFootX - hipP.x) || 1e-6));   // 엉덩이→발 방향
  let cmCandidate = dir_pre * (handP.x - preFootX) * userHeightCm;
  cmCandidate = Math.max(-120, Math.min(cmCandidate, 120));   // 중간 단계 클램프

  // 2) 히스테리시스 업데이트 (근접>=-20 → 락인, 멀어짐<=-30 → 해제)
  footAnchor.update(side, { cmCandidate, footP });

  // 3) 실제 계산에서 앵커 우선 사용
  const useFootX = footAnchor.isAnchored(side) ? footAnchor.valueFor(side, footP) : preFootX;

  const dir = Math.sign(((useFootX - hipP.x) || 1e-6));
  const forwardNormX = dir * (handP.x - useFootX);
  const cm = Math.max(-80, Math.min(forwardNormX * userHeightCm, 80)); // 최종 안전 클램프

  // ok: 손은 OK, 발은 (보이거나 앵커ON)이면 OK
  const footVisibleOK = !!footP && (footP.visibility ?? 0) >= FOOT_VIS_TH;
  const anchored = footAnchor.isAnchored(side);
  const ok = footVisibleOK || anchored;

  return { cm, side, ok, anchored };
}

// ─────────────────────────────────────────────────────────────
// 피크-홀드 컨트롤러 (원본 로직 유지)
// ─────────────────────────────────────────────────────────────
export function makePeakHoldController({
  needSec = 3.0,
  fps = 30,
  tolCm = 1.0,
  minIncrementToArm = 0.5,
} = {}) {
  let best = null;
  let armed = false;
  let holdFrames = 0;

  let holdSum = 0;
  let holdCount = 0;

  const NEED = Math.round(needSec * fps);

  function push(currentCm) {
    if (!Number.isFinite(currentCm)) currentCm = 0;

    if (best === null) {
      best = currentCm;
      armed = false;
      holdFrames = 0;
      holdSum = 0;
      holdCount = 0;
      return { bestCm: best, armed, holdSec: 0, done: false };
    }

    if (currentCm > best + minIncrementToArm) {
      best = currentCm;
      armed = true;
      holdFrames = 0;
      holdSum = 0;
      holdCount = 0;
    } else if (currentCm > best) {
      best = currentCm;
    }

    if (armed && currentCm >= best - tolCm) {
      holdFrames += 1;
      holdSum += currentCm;
      holdCount += 1;
      const avg = holdSum / Math.max(1, holdCount);
      if (avg > best) best = avg;
    } else {
      holdFrames = 0;
      holdSum = 0;
      holdCount = 0;
    }

    const done = armed && holdFrames >= NEED;
    return { bestCm: best, armed, holdSec: holdFrames / fps, done };
  }

  function breakHold() {
    holdFrames = 0;
    holdSum = 0;
    holdCount = 0;
  }

  function reset() {
    best = null;
    armed = false;
    holdFrames = 0;
    holdSum = 0;
    holdCount = 0;
  }

  return { push, breakHold, reset };
}
