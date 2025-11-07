// src/components/PlanCardsInlineWysiwyg.jsx
import React, { useMemo, useState } from "react";

/**
 * PlanCardsInlineWysiwyg
 * - planMd(텍스트)를 카드 배열로 파싱
 * - 카드 UI에서 직접 클릭 편집(contentEditable)
 * - 편집 내용 → 동일 포맷의 planMd 로 즉시 재조립하여 onChange 로 반환
 *
 * 필드
 *   종목, 빈도(F), 강도(I), 시간(T), 유형(T) (이름/대표영상 제목), 진행규칙·주의, CSV id
 */

const CAT_ORDER = ["유산소(심폐)", "근력/근지구력", "유연성"];
const CAT_INFO = {
  "유산소(심폐)":   { color: "#0ea5e9", emoji: "🏃", bg: "#e0f2fe" },
  "근력/근지구력": { color: "#22c55e", emoji: "🏋️", bg: "#dcfce7" },
  "유연성":        { color: "#f59e0b", emoji: "🧘", bg: "#fef3c7" },
  "기타":          { color: "#334155", emoji: "📋", bg: "#f1f5f9" },
};

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

// ---------- parser ----------
function splitIntoCardBlocks(full) {
  if (!full) return [];
  const parts = full
    .split(/\n(?=종목\s*$)/m)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.filter(b => /^종목\s*$/m.test((b.split("\n")[0] || "").trim()));
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
function parseTypeLine(typeLine) {
  const url   = (typeLine.match(/https?:\/\/[^\s)]+/i) || [])[0] || "";
  const title = ((typeLine.match(/대표영상:\s*([^()]+)\s*\(/) || [])[1] || "").trim();
  const names = (typeLine.split("· 대표영상:")[0] || "").trim();
  return { url, title, names };
}
function pickCsvId(block) {
  const m = block.match(/CSV\s*:\s*(\d+)/i);
  return (m && m[1]) || "";
}
function pickMovieTitle(block) {
  const m = block.match(/^\s*🎬\s*([^\n]+)\s*$/m);
  return (m && m[1].trim()) || "";
}
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

  const yt = parseTypeLine(typeRaw);
  const csv = pickCsvId(block);
  const movieA = pickMovieTitle(block);
  const movieB = pickParenMovieTitle(block);
  const movieTitle = yt.title || movieA || movieB || "";

  return {
    subject, freq, inten, time, sets, caut, rule,
    yt: { ...yt, title: movieTitle || yt.title, names: yt.names },
    evid: { csv },
    _raw: block,
  };
}
function assembleTypeLine({ names, title, url }) {
  // "달리기 · 대표영상: 달리기 (YouTube: https://...)" 형태로 재조립
  const left = (names || "").trim();
  const t    = (title || "").trim();
  const u    = (url || "").trim();
  const rep  = t ? `대표영상: ${t}` : "대표영상: -";
  const urlPart = u ? `(YouTube: ${u})` : "";
  return `${left} · ${rep} ${urlPart}`.trim();
}
function assembleOneCard(c) {
  // LABEL 순서 + 값 한 줄 — 기존 포맷과 동일 유지
  const lines = [];
  lines.push("종목", c.subject || "");
  lines.push("빈도(F)", c.freq || "");
  lines.push("강도(I)", c.inten || "");
  lines.push("시간(T)", c.time || "");
  lines.push("유형(T)", assembleTypeLine(c.yt || {}));
  if (c.sets) lines.push("세트/반복/휴식", c.sets);
  if (c.caut) lines.push("주의/대안", c.caut);
  if (c.rule) lines.push("진행규칙·주의", c.rule);
  // 하단 보강(🎬 제목, CSV)
  if (c.yt?.title) lines.push(`🎬 ${c.yt.title}`);
  if (c.evid?.csv) lines.push(`CSV:${c.evid.csv}`);
  return lines.join("\n") + "\n";
}
function assembleMarkdown(cards) {
  return cards.map(assembleOneCard).join("\n");
}

// ---------- UI ----------
function Pill({ children, color = "#334155", bg = "#e2e8f0" }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color, background: bg, border: `1px solid ${color}22`,
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </span>
  );
}

function InlineField({ value, placeholder, onCommit, multiline=false, style }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value || "");

  const commit = () => {
    setEditing(false);
    if (local !== value) onCommit(local.trim());
  };
  const cancel = () => { setEditing(false); setLocal(value || ""); };

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        title="클릭하여 편집"
        style={{
          cursor: "text",
          padding: "2px 4px",
          borderRadius: 6,
          boxShadow: "inset 0 0 0 1px #e5e7eb",
          background: "#fff",
          minWidth: 12,
          display: "inline-block",
          ...style,
        }}
      >
        {value?.length ? value : <span style={{color:"#94a3b8"}}>{placeholder || "-"}</span>}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        value={local}
        onChange={(e)=>setLocal(e.target.value)}
        onBlur={commit}
        rows={3}
        style={{
          width:"100%", resize:"vertical",
          padding:"6px 8px", borderRadius:8, border:"1px solid #cbd5e1",
          fontSize:14, lineHeight:1.5, ...style
        }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <input
      autoFocus
      value={local}
      onChange={(e)=>setLocal(e.target.value)}
      onKeyDown={(e)=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") cancel(); }}
      onBlur={commit}
      style={{
        padding:"4px 6px", borderRadius:8, border:"1px solid #cbd5e1",
        fontSize:14, ...style
      }}
      placeholder={placeholder}
    />
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"110px 1fr", gap:10 }}>
      <div style={{ color:"#475569", fontWeight:700 }}>{label}</div>
      <div style={{ whiteSpace:"pre-wrap" }}>{children}</div>
    </div>
  );
}

export default function PlanCardsInlineWysiwyg({ planMd, onChange }) {
  // 파싱
  const initCards = useMemo(() => {
    const blocks = splitIntoCardBlocks(planMd || "");
    return blocks.map(parseOneCard);
  }, [planMd]);

  const [cards, setCards] = useState(initCards);

  // 카드 배열이 바뀌면 md 재조립
  const sync = (next) => {
    setCards(next);
    if (typeof onChange === "function") onChange(assembleMarkdown(next));
  };

  const withCats = cards.map((c, idx) => ({
    catTitle: CAT_ORDER[idx] || "기타",
    data: c,
  }));

  return (
    <div style={{ display:"grid", gap:12 }}>
      {withCats.map(({ catTitle, data }, i) => {
        const info = CAT_INFO[catTitle] || CAT_INFO["기타"];

        const update = (patch) => {
          const next = cards.slice();
          next[i] = { ...next[i], ...patch };
          sync(next);
        };
        const updateYT = (patch) => update({ yt: { ...(data.yt||{}), ...patch } });
        const updateEvid = (patch) => update({ evid: { ...(data.evid||{}), ...patch } });

        return (
          <div
            key={i}
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
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div
                  style={{
                    width:12, height:12, borderRadius:999,
                    background:info.color, boxShadow:`0 0 0 4px ${info.color}22`
                  }}
                />
                <div style={{ fontSize:16, fontWeight:900 }}>
                  {info.emoji} {catTitle}
                </div>
              </div>

              {data.yt?.url && (
                <a
                  href={data.yt.url}
                  target="_blank" rel="noreferrer"
                  style={{
                    textDecoration:"none", border:`1px solid ${info.color}`,
                    color:"#fff", background:info.color, borderRadius:10,
                    padding:"8px 10px", fontWeight:800, fontSize:13
                  }}
                >
                  대표영상 보기
                </a>
              )}
            </div>

            {/* Body (inline editable) */}
            <div style={{ padding:16, display:"grid", gap:12 }}>
              <Row label="종목">
                <InlineField
                  value={data.subject}
                  placeholder="예: 달리기"
                  onCommit={(v)=>update({ subject: v })}
                />
              </Row>

              <Row label="빈도(F)">
                <InlineField
                  value={data.freq}
                  placeholder="예: 주 3회"
                  onCommit={(v)=>update({ freq: v })}
                />
              </Row>

              <Row label="강도(I)">
                <InlineField
                  value={data.inten}
                  placeholder="예: 심박수 120~140 bpm 또는 RPE 11~13"
                  onCommit={(v)=>update({ inten: v })}
                />
              </Row>

              <Row label="시간(T)">
                <InlineField
                  value={data.time}
                  placeholder="예: 회당 20분"
                  onCommit={(v)=>update({ time: v })}
                />
              </Row>

              <Row label="유형(T)">
                <div style={{ display:"grid", gap:6 }}>
                  <InlineField
                    value={data.yt?.names}
                    placeholder="예: 달리기"
                    onCommit={(v)=>updateYT({ names: v })}
                  />
                  <div style={{ fontSize:12, color:"#64748b" }}>(대표영상 제목)</div>
                  <InlineField
                    value={data.yt?.title}
                    placeholder="예: 트레드밀에서 걷기"
                    onCommit={(v)=>updateYT({ title: v })}
                  />
                  <div style={{ fontSize:12, color:"#64748b" }}>(YouTube URL)</div>
                  <InlineField
                    value={data.yt?.url}
                    placeholder="https://..."
                    onCommit={(v)=>updateYT({ url: v })}
                  />
                </div>
              </Row>

              <Row label="진행규칙·주의">
                <InlineField
                  value={data.rule}
                  multiline
                  placeholder="예: 저강도로 시작, 증상 모니터링하며 점진적으로 증가"
                  onCommit={(v)=>update({ rule: v })}
                />
              </Row>

              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:4 }}>
                <Pill color="#0f172a" bg="#e5e7eb">🎬 {data.yt?.title || "-"}</Pill>
                <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                  <Pill color="#0b5cab" bg="#dee9ff">CSV:{data.evid?.csv || "-"}</Pill>
                  <InlineField
                    value={data.evid?.csv || ""}
                    placeholder="row id"
                    onCommit={(v)=>updateEvid({ csv: v })}
                    style={{ marginLeft:6 }}
                  />
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
