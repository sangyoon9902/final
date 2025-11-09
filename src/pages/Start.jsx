// src/pages/Start.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/AppState";
import { createUser } from "../api/user";

import flatpickr from "flatpickr";
import { Korean } from "flatpickr/dist/l10n/ko.js";
import "flatpickr/dist/flatpickr.min.css";

function calcAgeFromDobISO(dobISO, now = new Date()) {
  if (!dobISO) return null;
  const [y, m, d] = dobISO.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const birth = new Date(y, m - 1, d);
  let age = today.getFullYear() - y;
  const hadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

/* ───── DOB Picker (flatpickr) ───── */
function DobPicker({ value, onChange, disabled, badgeText }) {
  const ref = useRef(null);
  const fpRef = useRef(null);

  useEffect(() => {
    fpRef.current = flatpickr(ref.current, {
      locale: Korean,
      dateFormat: "Y-m-d",
      defaultDate: value || null,
      maxDate: "today",
      allowInput: true,
      disableMobile: true,
      onChange: (dates) => {
        if (dates.length > 0) onChange(dates[0].toISOString().slice(0, 10));
      },
      onClose: () => {
        const v = ref.current.value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) onChange(v);
      },
    });
    return () => fpRef.current && fpRef.current.destroy();
  }, []);

  return (
    <div className="ctrl ctrl--dob">
      <input
        ref={ref}
        type="text"
        className="input input--ghost flatpickr-input"
        placeholder="YYYY-MM-DD"
        defaultValue={value || ""}
        disabled={disabled}
      />
      {badgeText ? <span className="badge badge--dob">{badgeText}</span> : null}
      <button
        type="button"
        className="iconBtn iconBtn--dob"
        aria-label="날짜 선택"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => !disabled && fpRef.current && fpRef.current.open()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" stroke="#334e68" strokeWidth="1.5"/>
          <path d="M8 3v4M16 3v4M3 9h18" stroke="#334e68" strokeWidth="1.5"/>
          <rect x="7" y="12" width="4" height="3" rx="1" fill="#334e68" opacity=".15"/>
        </svg>
      </button>
    </div>
  );
}

/* ───── ID 모달 ───── */
function IdModal({ open, id, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="id 안내">
      <div className="modalCard">
        <h3 className="modalTitle">id가 발급되었습니다</h3>
        <p className="modalDesc">아래 id는 결과 조회/리뷰 시 활용됩니다.</p>
        <div className="modalUidRow">
          <code className="modalUid">{id}</code>
          <button
            type="button"
            className="modalCopy"
            onClick={async () => {
              try { await navigator.clipboard.writeText(id); } catch {}
            }}
          >
            복사
          </button>
        </div>
        <button className="modalOk" type="button" onClick={onConfirm}>
          확인하고 설문으로 이동
        </button>
      </div>
    </div>
  );
}

export default function Start() {
  const nav = useNavigate();
  const { setProfile } = useApp();

  const [form, setForm] = useState({ name: "", sex: "M", dob: "", height: "", weight: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 제출 후 모달에 보여줄 id만 관리 (초기 표시 X)
  const [visibleId, setVisibleId] = useState("");
  const [showIdModal, setShowIdModal] = useState(false);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const agePreview = form.dob ? calcAgeFromDobISO(form.dob) : null;

  async function handleStart(e) {
    e.preventDefault();
    setErr("");
    const { name, sex, dob, height, weight } = form;

    if (!name.trim()) return setErr("이름을 입력해주세요.");
    if (!dob) return setErr("생년월일을 선택해주세요.");
    const todayISO = new Date().toISOString().slice(0, 10);
    if (dob > todayISO) return setErr("미래 날짜는 선택할 수 없습니다.");
    const age = calcAgeFromDobISO(dob);
    if (age == null || age < 0 || age > 120) return setErr("생년월일을 올바르게 입력해주세요.");
    if (!height || Number(height) <= 0) return setErr("키(cm)를 올바르게 입력해주세요.");
    if (!weight || Number(weight) <= 0) return setErr("몸무게(kg)를 올바르게 입력해주세요.");

    try {
      setLoading(true);
      // 서버에서 새 id 발급
      const { id } = await createUser({ name: name.trim() });

      const profile = {
        name: name.trim(),
        sex,
        dob,
        age,
        height: Number(height),
        weight: Number(weight),
        id,
      };

      setProfile(profile);
      localStorage.setItem("ai_fitness_user", JSON.stringify({ name: profile.name, id }));

      // ✅ 제출 후에만 모달로 노출
      setVisibleId(id);
      setShowIdModal(true);
    } catch (e) {
      console.error(e);
      setErr("계정 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      {/* 로컬 스타일 */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .grid > * { min-width: 0; }
        .grid > label { display:block; }

        :root{
          --radius:16px; --inpH:56px; --font:16px; --label:13px;
          --stroke:#c8d6f0; --stroke2:#99b6f0; --text:#0f1b2d; --muted:#667085;
          --brand:#112a66; --brand-hover:#173a8e;
          --chip-bg:rgba(13,110,253,.08); --chip-stroke:rgba(13,110,253,.18); --chip-fg:#0b5cab;
          --gap-col:15px; --gap-row:10px;
        }
        .page{ min-height:100vh; display:flex; flex-direction:column; align-items:center;
               background:linear-gradient(180deg,#e8f0ff 0%,#ffffff 100%); padding:32px 16px; text-align:center; }
        .title{ font-size:2.6rem; font-weight:900; color:#082c7a; margin:0 0 14px }
        .card{ width:100%; max-width:760px; background:#fff; border-radius:28px;
               box-shadow:0 18px 52px rgba(0,0,0,.10); padding:36px; text-align:left; }
        .grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr));
               column-gap:var(--gap-col); row-gap:var(--gap-row); }
        @media (max-width: 768px){ .grid{ grid-template-columns:1fr; column-gap:0 } }

        .label{ font-size:var(--label); margin:0 0 10px; color:#334e68; font-weight:700 }

        .input, .select, .ctrl{
          width:100%; height:var(--inpH); font-size:var(--font); color:var(--text);
          border:1px solid var(--stroke); border-radius:var(--radius);
          background:#fff; outline:none; padding:0 16px;
          transition:border-color .15s, box-shadow .15s, background .15s;
        }
        .input:focus, .select:focus, .ctrl:focus-within{
          border-color:var(--stroke2); box-shadow:0 0 0 4px rgba(68,132,255,.15);
        }

        .select{
          appearance:none;
          background-image: linear-gradient(45deg, transparent 50%, #666 50%), linear-gradient(135deg, #666 50%, transparent 50%);
          background-position: calc(100% - 18px) calc(1.05em), calc(100% - 13px) calc(1.05em);
          background-size:5px 5px, 5px 5px; background-repeat:no-repeat; padding-right:40px;
        }

        .ctrl{ position:relative; overflow:hidden; display:flex; align-items:center; }
        .ctrl--dob{ padding-right:110px; }
        .input--ghost{ flex:1; height:100%; border:none; background:transparent; padding:0; }
        .flatpickr-input{ width:100% !important; border:none !important; box-shadow:none !important; background:transparent !important; }

        .iconBtn{ width:36px; height:36px; border-radius:10px; border:none; background:transparent; cursor:pointer;
                  display:inline-flex; align-items:center; justify-content:center; }
        .iconBtn--dob{ position:absolute; right:12px; top:50%; transform:translateY(-50%); }
        .badge{ font-weight:800; color:var(--chip-fg); background:var(--chip-bg); border:1px solid var(--chip-stroke);
                padding:6px 10px; border-radius:999px; white-space:nowrap; font-size:12px; }
        .badge--dob{ position:absolute; right:54px; top:50%; transform:translateY(-50%); }

        .spacer{ grid-column:1 / -1; height:28px }

        .btn{ width:100%; margin-top:24px; height:56px; border-radius:20px; border:none; cursor:pointer;
              background:var(--brand); color:#fff; font-weight:900; font-size:1.05rem;
              box-shadow:0 12px 28px rgba(0,0,0,.15); transition:background .12s ease; }
        .btn:hover{ background:var(--brand-hover) }
        .btn:disabled{ opacity:.7; cursor:not-allowed }
        .hint{ margin-top:12px; color:var(--muted); font-size:12px }
        .error{ margin-bottom:16px; padding:12px 14px; border-radius:12px;
                border:1px solid #f2b8b5; background:#fdeceb; color:#b42318; font-size:13px }

        /* ── 모달 ── */
        .modalBackdrop{
          position:fixed; inset:0; background:rgba(0,0,0,.45);
          display:flex; align-items:center; justify-content:center; padding:20px; z-index:1000;
        }
        .modalCard{
          width:min(640px, 94vw); background:#fff; border-radius:20px; padding:22px 22px 18px;
          box-shadow:0 24px 80px rgba(0,0,0,.25);
        }
        .modalTitle{ margin:0 0 6px; font-size:20px; font-weight:900; color:#0b1a33 }
        .modalDesc{ margin:0 0 12px; color:#334e68; font-size:14px }
        .modalUidRow{ display:flex; align-items:center; gap:10px; margin:12px 0 18px }
        .modalUid{ flex:1; font-family: ui-monospace, Menlo, monospace; font-size:14px; background:#f4f7ff;
                   padding:10px 12px; border-radius:12px; color:#0b5cab; border:1px solid #d9e3ff; }
        .modalCopy{ border:none; border-radius:12px; padding:10px 14px; cursor:pointer; background:#e7eeff; color:#0b5cab; font-weight:900 }
        .modalCopy:hover{ filter:brightness(.96); }
        .modalOk{ width:100%; height:48px; border:none; border-radius:14px; cursor:pointer; background:#112a66; color:#fff; font-weight:900 }
        .modalOk:hover{ background:#173a8e }
      `}</style>

      <h1 className="title">국민체력 100 간편측정</h1>
      <img src="/character.png" alt="캐릭터" style={{ width: 184, height: "auto", marginBottom: 18 }} />

      <form className="card" onSubmit={handleStart}>
        {err && <div className="error">{err}</div>}

        {/* ✅ 기본 화면에서 id 배지는 표시하지 않음 */}

        <div className="grid">
          <label style={{ gridColumn: "1 / -1" }}>
            <div className="label">이름</div>
            <input
              className="input"
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="홍길동"
              disabled={loading}
            />
          </label>

          <label>
            <div className="label">성별</div>
            <select
              className="select"
              value={form.sex}
              onChange={(e) => update("sex", e.target.value)}
              disabled={loading}
            >
              <option value="M">남</option>
              <option value="F">여</option>
            </select>
          </label>

          <label>
            <div className="label">생년월일</div>
            <DobPicker
              value={form.dob}
              disabled={loading}
              onChange={(iso) => update("dob", iso)}
              badgeText={agePreview != null ? `만 ${agePreview}세` : ""}
            />
          </label>

          <div className="spacer" />

          <label>
            <div className="label">키 (cm)</div>
            <input
              className="input"
              type="number"
              value={form.height}
              onChange={(e) => update("height", Number(e.target.value))}
              placeholder="170"
              disabled={loading}
            />
          </label>

          <label>
            <div className="label">몸무게 (kg)</div>
            <input
              className="input"
              type="number"
              value={form.weight}
              onChange={(e) => update("weight", Number(e.target.value))}
              placeholder="65"
              disabled={loading}
            />
          </label>
        </div>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "저장 중…" : "다음 단계로 이동"}
        </button>

        <p className="hint">입력값은 브라우저 로컬과 앱 상태에 저장되며, id는 서버에서 1회 발급됩니다.</p>
      </form>

      <p style={{ marginTop: 18, color: "#666", fontSize: "0.9rem" }}>
        AI 피트니스 코칭 기반 국민체력 100 간이 측정 서비스
      </p>

      {/* ✅ 발급 직후에만 모달 표시 */}
      <IdModal
        open={showIdModal}
        id={visibleId}
        onConfirm={() => nav("/survey1")}
      />
    </div>
  );
}
