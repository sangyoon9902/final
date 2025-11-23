import { Outlet, useLocation } from "react-router-dom";

export default function App() {
  const loc = useLocation();
  // console.log("✅ App render, pathname =", loc.pathname); // 디버깅용 로그도 필요 없다면 삭제

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "64px 1fr",
        minHeight: "100vh",
        backgroundColor: "#060b24",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ── 상단 헤더 (버튼 제거됨) ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 24px", // 좌우 여백을 조금 더 넉넉하게
          borderBottom: "1px solid #1a2550",
          backgroundColor: "#09091c",
          height: "64px",
        }}
      >
        <strong style={{ fontSize: "20px" }}>🏋️ 체크핏(CHECK-FIT)</strong>
      </header>

      {/* ── 메인 컨텐츠 영역 ── */}
      <main style={{ padding: 16 }}>
        {/* 페이지 전환 시 상태 초기화를 위해 key 유지 */}
        <Outlet key={loc.key} />
      </main>
    </div>
  );
}