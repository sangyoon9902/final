// src/state/AppState.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const Ctx = createContext(null);
const LS_KEY = "ai_fitness_user";

// 안전 파싱
function loadLocalUser() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveLocalUser(u) {
  if (!u || !u.userId) return;
  localStorage.setItem(LS_KEY, JSON.stringify({ userId: u.userId, name: u.name || "" }));
}
function clearLocalUser() {
  localStorage.removeItem(LS_KEY);
}

export function AppProvider({ children }) {
  /* ───────── 사용자 기초정보 ───────── */
  // 로컬의 {userId, name}를 우선 반영
  const initialUser = loadLocalUser();
  const [profile, setProfile] = useState(() => ({
    // 로그인/생성 정보
    userId: initialUser?.userId || "",
    name: initialUser?.name || "",

    // 기본 프로필(측정용 표시)
    sex: "M",      // 'M' | 'F'
    age: 25,
    height: 170,   // cm (프런트 표시용)
    weight: 65,    // kg
  }));

  // profile 변경 시 로컬에도 반영 (userId 있을 때만)
  useEffect(() => {
    if (profile?.userId) saveLocalUser({ userId: profile.userId, name: profile.name || "" });
  }, [profile?.userId, profile?.name]);

  /* ───────── 현재 측정 중인/마지막으로 본 테스트 ───────── */
  // 'situp' | 'step' | 'reach'
  const [selectedTest, setSelectedTest] = useState(null);

  /* ───────── 측정 결과 + 전송 관련 필드 ───────── */
  const [session, setSession] = useState({
    // 전송/표시 제어
    readyToSend: false, // 모든 측정/설문 완료 후 true → Results에서 버튼 노출
    traceId: "",
    planMd: "",

    // 윗몸일으키기
    situp: { reps: 0, maxTorsoDeg: 0 },

    // 스텝 테스트
    step: {
      durationSec: 180,
      bpm: 96,
      compliance: 0,     // 0~1
      recoveryAvg: null,
      vo2max: null,
    },

    // 좌전굴(유연성)
    reach: {
      bestCm: 0,
      scalePxPerCm: 0,
      baselinePx: null,
    },
  });

  /* ───────── 설문 결과 (Survey1~4 전체 누적) ───────── */
  const [surveys, setSurveys] = useState({});

  /* ───────── 전송 플로우 액션 ───────── */
  // (1) 모든 측정/설문 끝났을 때 호출 → Results에서 버튼이 보임
  const markSessionReady = () =>
    setSession((s) => ({ ...s, readyToSend: true, traceId: "", planMd: "" }));

  // (2) 서버 응답 수신 후 저장 → Results에서 마크다운/trace_id 표시
  const setResultFromServer = ({ traceId, planMd }) =>
    setSession((s) => ({ ...s, traceId: traceId ?? "", planMd: planMd ?? "" }));

  // (3) 한 세션 초기화(다시 측정 시작 등)
  const resetSession = () =>
    setSession({
      readyToSend: false,
      traceId: "",
      planMd: "",
      situp: { reps: 0, maxTorsoDeg: 0 },
      step: { durationSec: 180, bpm: 96, compliance: 0, recoveryAvg: null, vo2max: null },
      reach: { bestCm: 0, scalePxPerCm: 0, baselinePx: null },
    });

  // (4) 전체 초기화(로그아웃 느낌)
  const resetAll = () => {
    clearLocalUser();
    setProfile({ userId: "", name: "", sex: "M", age: 25, height: 170, weight: 65 });
    resetSession();
    setSelectedTest(null);
    setSurveys({});
  };

  /* ───────── 편의 헬퍼(선택) ───────── */
  const setSitup = (patch) =>
    setSession((s) => ({ ...s, situp: { ...s.situp, ...(typeof patch === "function" ? patch(s.situp) : patch) } }));
  const setStep = (patch) =>
    setSession((s) => ({ ...s, step: { ...s.step, ...(typeof patch === "function" ? patch(s.step) : patch) } }));
  const setReach = (patch) =>
    setSession((s) => ({ ...s, reach: { ...s.reach, ...(typeof patch === "function" ? patch(s.reach) : patch) } }));

  const hasUser = useMemo(() => !!profile?.userId, [profile?.userId]);

  /* ───────── 컨텍스트 value ───────── */
  const value = {
    // 사용자/세션/설문 상태
    profile, setProfile,
    selectedTest, setSelectedTest,
    session, setSession,
    surveys, setSurveys,

    // 전송 플로우
    markSessionReady,
    setResultFromServer,
    resetSession,
    resetAll,

    // 편의 헬퍼
    setSitup, setStep, setReach,

    // 파생
    hasUser,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
