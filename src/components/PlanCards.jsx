// src/components/PlanCards.jsx
import React from "react"; // [수정] useState 제거 (원문보기 토글 삭제)

/**
 * PlanCards (v5) — 카드 원문 파서 (대표영상 버튼 O, 하단 알약 X)
 *
 * v3를 기반으로 하되, 카드 본문 하단의 🎬영상제목 및 CSV:ID 알약(Pill)만 제거한 버전입니다.
 * '대표영상 보기' 버튼은 헤더에 유지됩니다.
 * '원문 보기' 토글은 Results.jsx에 있으므로 여기서 제거합니다.
 */

const CAT_ORDER = ["유산소(심폐)", "근력/근지구력", "유연성"];
const CAT_INFO = {
  "유산소(심폐)":   { color: "#0ea5e9", emoji: "🏃", bg: "#e0f2fe" },
  "근력/근지구력": { color: "#22c55e", emoji: "🏋️", bg: "#dcfce7" },
  "유연성":        { color: "#f59e0b", emoji: "🧘", bg: "#fef3c7" },
  "기타":          { color: "#334155", emoji: "📋", bg: "#f1f5f9" },
};

// 라벨 리스트
const LABELS = [
  "종목",
  "빈도(F)",
  "강도(I)",
  "시간(T)",
  "유형(T)",
  "세트/반복/휴식",
  "주의/대안",
  "진행규칙·주의",
];

/* ───────── 파서 유틸 (v3 복원) ───────── */

function splitIntoCardBlocks(full) {
  if (!full) return [];
  const parts = full
    .split(/\n(?=종목\s*$)/m)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.filter(b => /^종목\s*$/m.test(b.split("\n")[0] || ""));
}

function valueAfterSingleLine(block, label) {
  const re = new RegExp(`^${escapeRegExp(label)}\\s*$`, "m");
  const m = block.match(re);
  if (!m) return "";
  const after = block.slice(m.index + m[0].length);
  const nextLine = (after.match(/^\s*\n?([^\n]+)\n?/m) || [])[1] || "";
  return nextLine.trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// [복원] 유형(T) 라인 파싱 (버튼 URL 필요)
function parseTypeLine(typeLine) {
  const url   = (typeLine.match(/https?:\/\/[^\s)]+/i) || [])[0] || "";
  const title = ((typeLine.match(/대표영상:\s*([^()]+)\s*\(/) || [])[1] || "").trim();
  const names = (typeLine.split("· 대표영상:")[0] || "").trim();
  return { url, title, names };
}

// [복원] CSV 라인 추출 (파싱은 하지만 렌더링 안 함)
function pickCsvId(block) {
  const m = block.match(/CSV\s*:\s*(\d+)/i);
  return (m && m[1]) || "";
}

// [복원] 🎬 라인에서 대표영상 제목 보강
function pickMovieTitle(block) {
  const m = block.match(/^\s*🎬\s*([^\n]+)\s*$/m);
  return (m && m[1].trim()) || "";
}

// [복원] (대표영상: 제목) 단독 줄도 있을 수 있음
function pickParenMovieTitle(block) {
  const m = block.match(/\(대표영상:\s*([^)]+)\)/);
  return (m && m[1].trim()) || "";
}

function parseOneCard(block) {
  const subject = valueAfterSingleLine(block, "종목");
  const freq    = valueAfterSingleLine(block, "빈도(F)");
  const inten   = valueAfterSingleLine(block, "강도(I)");
  const time    = valueAfterSingleLine(block, "시간(T)");
  const typeRaw = valueAfterSingleLine(block, "유형(T)");
  const sets    = valueAfterSingleLine(block, "세트/반복/휴식");
  const caut    = valueAfterSingleLine(block, "주의/대안");
  const rule    = valueAfterSingleLine(block, "진행규칙·주의");

  // [복원] 파싱 로직
  const yt = parseTypeLine(typeRaw);
  const csv = pickCsvId(block);
  const movieA = pickMovieTitle(block);
  const movieB = pickParenMovieTitle(block);
  const movieTitle = yt.title || movieA || movieB || "";

  return {
    subject,
    freq,
    inten,
    time,
    type: typeRaw,
    sets,
    caut,
    rule,
    evid: { csv }, // [복원] 데이터는 파싱
    yt: { ...yt, title: movieTitle || yt.title, names: yt.names }, // [복원] 데이터는 파싱
    _raw: block,
  };
}

/* ───────── UI 컴포넌트 ───────── */

// [제거] Pill 컴포넌트 (요청대로 렌더링 안 하므로 삭제)

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 10 }}>
      <div style={{ color: "#475569", fontWeight: 700 }}>{label}</div>
      <div style={{ whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

function Card({ catTitle, data }) {
  const info = CAT_INFO[catTitle] || CAT_INFO["기타"];
  
  // [복원] 유형(T) 표시에 대표영상 제목 포함 (Pill과 무관)
  const showType = data.yt?.names
    ? `${data.yt.names}\n(대표영상: ${data.yt.title || "-"})`
    : data.type;

  return (
    <div
      style={{
        border: `1px solid ${info.color}33`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 14px 36px rgba(2,6,23,.06)",
        background: "#fff",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(180deg, ${info.bg}, #ffffff)`,
          borderBottom: `1px solid ${info.color}22`,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: info.color,
              boxShadow: `0 0 0 4px ${info.color}22`,
            }}
          />
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {info.emoji} {catTitle}
          </div>
        </div>
        
        {/* [복원] '대표영상 보기' 버튼 */}
        {data.yt?.url && (
          <a
            href={data.yt.url}
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: "none",
              border: `1px solid ${info.color}`,
              color: "#fff",
              background: info.color,
              borderRadius: 10,
              padding: "8px 10px",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            대표영상 보기
          </a>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <Row label="종목" value={data.subject} />
        <Row label="빈도(F)" value={data.freq} />
        <Row label="강도(I)" value={data.inten} />
        <Row label="시간(T)" value={data.time} />
        <Row label="유형(T)" value={showType} /> {/* [복원] 포맷된 유형 사용 */}
        <Row label="세트/반복/휴식" value={data.sets} />
        <Row label="주의/대안" value={data.caut} />
        <Row label="진행규칙·주의" value={data.rule} />

        {/* [제거] 요청하신 🎬영상제목 및 CSV:ID 알약(Pill) 렌더링 div 삭제 */}
      </div>
    </div>
  );
}

export default function PlanCards({ planMd }) { // [수정] showRawToggle prop 제거
  if (!planMd || typeof planMd !== "string") return null;

  // 카드 블록 파싱
  const blocks = splitIntoCardBlocks(planMd);
  const cards = blocks.map(parseOneCard);

  // 카테고리 매핑
  const withCats = cards.map((c, idx) => ({
    catTitle: CAT_ORDER[idx] || "기타",
    data: c,
  }));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {withCats.map((c, i) => (
        <Card key={i} catTitle={c.catTitle} data={c.data} />
      ))}

      {/* [제거] '원문 보기' <details> 블록 삭제 (Results.jsx에 이미 있음) */}
    </div>
  );
}