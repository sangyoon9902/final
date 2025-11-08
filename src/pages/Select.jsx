// src/pages/Select.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../state/AppState";

// ───────────────────────── 경로 유틸 ─────────────────────────
const BASE = (import.meta?.env?.BASE_URL || "/").replace(/\/+$/, "/");

// id: "situp"|"step"|"reach"
function imgCandidates(id) {
  // 1) 루트에 있는 경우 (/situp.png)
  // 2) /images 폴더에 있는 경우 (/images/situp.png)
  // 3) @2x 파일만 있는 경우 대응
  // 필요에 따라 순서만 바꿔도 됨.
  return [
    `${BASE}${id}.png`,
    `${BASE}images/${id}.png`,
    `${BASE}${id}@2x.png`,
    `${BASE}images/${id}@2x.png`,
  ];
}

const FALLBACK_IMG = [
  `${BASE}character.png`,
  `${BASE}images/character.png`,
  `${BASE}character@2x.png`,
  `${BASE}images/character@2x.png`,
];

// ───────────────────────── 16:9 비율 박스 + 폴백 ─────────────────────────
const CARD_MEDIA_ASPECT_PERCENT = 70.25; // 16:9

function MediaBox({ srcList, alt, fit = "cover" }) {
  const [i, setI] = useState(0);
  const src = srcList?.[i];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        paddingTop: `${CARD_MEDIA_ASPECT_PERCENT}%`,
        borderRadius: 10,
        border: "1px solid #222",
        overflow: "hidden",
        background: "#111",
      }}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit, // 'cover' or 'contain'
            display: "block",
          }}
          loading="lazy"
          decoding="async"
          onError={() => {
            // 다음 후보로 폴백, 후보 없으면 공용 폴백도 시도
            if (i + 1 < srcList.length) {
              setI(i + 1);
            } else if (srcList !== FALLBACK_IMG) {
              // 공용 폴백 시도로 교체
              setI(0);
              srcList.splice(0, srcList.length, ...FALLBACK_IMG);
            }
          }}
        />
      )}
    </div>
  );
}

export default function Select() {
  const nav = useNavigate();
  const location = useLocation();
  const { session, markSessionReady } = useApp();

  // 방금 측정 완료 알림
  const [justFinished, setJustFinished] = useState(() => location.state?.justFinished ?? null);
  useEffect(() => {
    if (location.state?.justFinished) {
      const t = setTimeout(() => {
        nav(".", { replace: true, state: null });
        setJustFinished(null);
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [location.state, nav]);

  // 완료 여부 및 요약 계산
  const {
    situpDone, reachDone, stepDone, allDone,
    situpSummary, reachSummary, stepSummary,
  } = useMemo(() => {
    const reps = Number(session?.situp?.reps ?? 0);
    const situpDone = reps > 0;
    const situpSummary = situpDone ? `횟수 ${reps}회` : "미측정";

    const bestCm = session?.reach?.bestCm;
    const reachHasBaseline =
      session?.reach?.baselinePx != null || (session?.reach?.scalePxPerCm ?? 0) > 0;
    const reachDone = Number.isFinite(bestCm) || reachHasBaseline;
    const reachSummary = reachDone
      ? `최대 ${Number(bestCm ?? 0) >= 0 ? "+" : ""}${Number(bestCm ?? 0).toFixed(1)} cm`
      : "미측정";

    const vo2 = session?.step?.vo2max;
    const rec = session?.step?.recoveryAvg;
    const stepDone = (vo2 != null) || (rec != null);
    const stepSummary = stepDone
      ? `VO₂max ${vo2 != null ? Number(vo2).toFixed(1) : "—"} / 회복 ${rec ?? "—"}`
      : "미측정";

    return {
      situpDone, reachDone, stepDone,
      allDone: situpDone && reachDone && stepDone,
      situpSummary, reachSummary, stepSummary,
    };
  }, [session]);

  // 유튜브 가이드 링크
  const videoLinks = {
    situp: "https://www.youtube.com/watch?v=RZ4xuuFnZiU",
    step: "https://youtube.com/watch?v=xFtWEPFp5wM",
    reach: "https://youtube.com/watch?v=ydKH9ybDUZ4",
  };

  // 테스트 항목
  const tests = [
    {
      id: "situp",
      title: "윗몸말아올리기",
      desc: "사진처럼 약 70° 각도로 카메라를 위치시키고, 전신이 나오도록 누워주세요.",
      guide: "무릎을 세우고 누워 상체를 말아 올렸다가 내립니다.",
      path: "/measure/situp",
      done: Number(session?.situp?.reps ?? 0) > 0,
      summary:
        Number(session?.situp?.reps ?? 0) > 0
          ? `횟수 ${Number(session?.situp?.reps).toString()}회`
          : "미측정",
    },
    {
      id: "step",
      title: "스텝검사",
      desc: "3분간 정해진 리듬으로 오르내리고 1분간 휴식하며 심박수를 측정합니다.",
      guide: "심박수로 심폐지구력을 평가합니다.",
      path: "/measure/step",
      done: (session?.step?.vo2max != null) || (session?.step?.recoveryAvg != null),
      summary:
        (session?.step?.vo2max != null || session?.step?.recoveryAvg != null)
          ? `VO₂max ${session?.step?.vo2max != null ? Number(session.step.vo2max).toFixed(1) : "—"} / 회복 ${session?.step?.recoveryAvg ?? "—"}`
          : "미측정",
    },
    {
      id: "reach",
      title: "앉아윗몸앞으로굽히기(cm)",
      desc: "측면(90°)에서 카메라를 두고 다리를 펴고 앉아주세요.",
      guide: "손끝을 최대한 멀리 뻗어 유연성을 평가합니다.",
      path: "/measure/reach",
      done:
        Number.isFinite(session?.reach?.bestCm) ||
        session?.reach?.baselinePx != null ||
        (session?.reach?.scalePxPerCm ?? 0) > 0,
      summary:
        (Number.isFinite(session?.reach?.bestCm) ||
          session?.reach?.baselinePx != null ||
          (session?.reach?.scalePxPerCm ?? 0) > 0)
          ? `최대 ${Number(session?.reach?.bestCm ?? 0) >= 0 ? "+" : ""}${Number(session?.reach?.bestCm ?? 0).toFixed(1)} cm`
          : "미측정",
    },
  ];

  const go = (path) => nav(path);

  const chipStyle = (ok) => ({
    display: "inline-block",
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
    border: `1px solid ${ok ? "#2ecc71" : "#777"}`,
    color: ok ? "#2ecc71" : "#aaa",
    background: ok ? "rgba(46, 204, 113, 0.12)" : "transparent",
  });

  return (
    <div style={{ color: "#fff", background: "#000", minHeight: "100vh", padding: 16 }}>
      {justFinished && (
        <div style={{
          marginBottom: 12, padding: "10px 12px", borderRadius: 10,
          border: "1px solid #2a4c8f", background: "#112244",
          color: "#9fc3ff", fontSize: 14
        }}>
          ✅ <b>{labelOf(justFinished.test)}</b> 측정이 완료되었습니다
          {justFinished.summary ? ` (${justFinished.summary})` : ""}.
        </div>
      )}

      <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 20, fontWeight: 700 }}>
        종목 선택
      </h2>
      <p style={{ marginTop: 0, marginBottom: 16, fontSize: 13, color: "#aaa", lineHeight: 1.4 }}>
        각 항목을 측정하면 카드에 <b>완료</b> 표시와 <b>간단 결과</b>가 나타납니다.
        세 종목 모두 완료되면 <b>다음</b> 버튼이 활성화됩니다.
      </p>

      {/* ───────── 카드 목록 ───────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 12,
      }}>
        {tests.map((t) => (
          <div key={t.id} style={{
            background: "#1a1a2a",
            border: "1px solid #333",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{t.title}</div>
              <span style={chipStyle(t.done)}>{t.done ? "완료" : "미완료"}</span>
            </div>

            <div style={{ fontSize: 12, color: "#7aa8ff" }}>{t.desc}</div>

            {/* 🔽 16:9 비율의 반응형 이미지 박스 + 폴백 */}
            <MediaBox srcList={imgCandidates(t.id)} alt={`${t.title} 예시`} fit="cover" />

            <div style={{ fontSize: 13, color: "#ccc" }}>{t.guide}</div>

            <a
              href={videoLinks[t.id]}
              target="_blank"
              rel="noopener noreferrer"
              style={videoBtnStyle}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 7.5V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10H3V7.5zm0-1.9A2 2 0 0 1 5 4h4l1.2 2.4H6.2L7.4 9H5L3 5.6v0zm7.8-1.6H19a2 2 0 0 1 2 2v1.5h-6.3l-1.9-3.5zM12 13l5 3-5 3v-6z" />
              </svg>
              동영상 가이드
            </a>

            <div style={{
              marginTop: 6,
              fontSize: 13,
              color: t.done ? "#9fe6b8" : "#aaa",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "8px 10px",
              borderRadius: 8
            }}>
              결과: {t.summary}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={btnStyle("#444")} onClick={() => go(t.path)}>
                측정하기
              </button>
              {t.done && (
                <button style={btnStyle("#2a72c6")} onClick={() => go(t.path)}>
                  다시 측정
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ───────── 하단 진행 요약 ───────── */}
      <div style={{
        marginTop: 20,
        background: "#0b0b0b",
        border: "1px solid #222",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}>
        <div style={{ fontSize: 14, color: "#ddd" }}>
          진행: {tests[0].done ? "●" : "○"} 윗몸 · {tests[2].done ? "●" : "○"} 좌전굴 · {tests[1].done ? "●" : "○"} 스텝
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={btnStyle("#0b5cab", !(tests[0].done && tests[1].done && tests[2].done))}
            onClick={() => {
              const allDone = tests.every(x => x.done);
              if (!allDone) return;
              markSessionReady();
              nav("/results");
            }}
            disabled={!tests.every(x => x.done)}
          >
            다음
          </button>
          <button style={btnStyle("#555")} onClick={() => nav("/")}>
            뒤로
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 보조 함수 ─────────────────────────
function labelOf(testKey) {
  if (testKey === "situp") return "윗몸말아올리기";
  if (testKey === "reach") return "앉아윗몸앞으로굽히기";
  if (testKey === "step") return "스텝검사";
  return String(testKey ?? "");
}

function btnStyle(bg, disabled = false) {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    minWidth: 120,
  };
}

// 네이비 버튼 스타일 (동영상 가이드)
const videoBtnStyle = {
  marginTop: 6,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  color: "#fff",
  background: "#1f2b78",
  border: "1px solid #1a2666",
  boxShadow: "0 1px 0 rgba(0,0,0,0.35) inset",
  transition: "filter 0.12s ease, transform 0.02s ease",
  userSelect: "none",
  outline: "none",
};
