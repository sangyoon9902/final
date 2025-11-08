import { Outlet, Link, useLocation } from "react-router-dom";

export default function App() {
  const loc = useLocation();
  console.log("✅ App render, pathname =", loc.pathname);

  const inMeasure = loc.pathname.startsWith("/measure/");
  const measureName = (() => {
    if (loc.pathname.startsWith("/measure/situp")) return "윗몸";
    if (loc.pathname.startsWith("/measure/step")) return "스텝";
    if (loc.pathname.startsWith("/measure/reach")) return "좌전굴";
    return null;
  })();

  const selectLabel = inMeasure && measureName ? `현재: ${measureName}` : "종목선택";

  return (
    <div style={{
      display: "grid",
      gridTemplateRows: "64px 1fr",
      minHeight: "100vh",
      backgroundColor: "#060b24ff",
      color: "#fff",
      fontFamily: "system-ui,sans-serif",
    }}>
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid #1a2550",
        backgroundColor: "#09091cff",
        height: "64px",
      }}>
        <strong>🏋️ AI Fitness</strong>
        <nav style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          fontSize: "13px",
          lineHeight: 1.3,
        }}>
          {/* 순서: 시작 → 설문1~4 → 종목선택(동적 라벨) → 결과 */}
          <NavBtn to="/">시작</NavBtn>
          <NavBtn to="/survey1">설문1</NavBtn>
          <NavBtn to="/survey2">설문2</NavBtn>
          <NavBtn to="/survey3">설문3</NavBtn>
          <NavBtn to="/survey4">설문4</NavBtn>
          {/* /measure/* 에 있을 때도 활성화되도록 activeOverride 전달 */}
          <NavBtn to="/select" activeOverride={inMeasure}>{selectLabel}</NavBtn>
          <NavBtn to="/results">결과</NavBtn>
        </nav>
      </header>

      <main style={{ padding: 16 }}>
        <Outlet key={loc.key} />
      </main>
    </div>
  );
}

/* ───────── NavBtn: activeOverride 추가 ───────── */
function NavBtn({ to, children, activeOverride = false }) {
  const loc = useLocation();
  const computedActive =
    loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to));
  const active = activeOverride || computedActive;

  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      style={{
        background: active ? "#3b82f6" : "#1a1a2a",
        border: active ? "1px solid #60a5fa" : "1px solid #444",
        borderRadius: "8px",
        padding: "6px 10px",
        color: active ? "#fff" : "#ccc",
        textDecoration: "none",
        fontWeight: active ? 700 : 500,
        fontSize: "13px",
        lineHeight: 1.3,
        boxShadow: active ? "0 0 6px #2563ebaa" : "none",
        transition: "all 0.2s ease",
      }}
    >
      {children}
    </Link>
  );
}
