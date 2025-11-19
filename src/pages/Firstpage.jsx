import { Link } from "react-router-dom";

export default function Firstpage() {
  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "120px 20px",
        textAlign: "center",
        color: "#fff",
      }}
    >
      <h1
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginBottom: 40,
        }}
      >
        AI Fitness
      </h1>

      {/* 🔥 시작하기 버튼 */}
      <Link
        to="/start"
        style={{
          display: "inline-block",
          padding: "16px 36px",
          background: "#3b82f6",
          borderRadius: 12,
          color: "#fff",
          fontSize: 20,
          fontWeight: 800,
          textDecoration: "none",
          border: "1px solid #60a5fa",
          boxShadow: "0 0 18px #1e40af66",
          transition: "all 0.2s ease",
        }}
      >
        시작하기
      </Link>

      {/* 🔥 이미지 삽입 부분 */}
      <div style={{ marginTop: 40 }}>
        <img
          src="/start-characters.png"
          alt="운동 캐릭터들"
          style={{
            width: "100%",
            maxWidth: 600,
            borderRadius: 16,
          }}
        />
      </div>

      <p style={{ marginTop: 28, fontSize: 13, color: "#94a3b8" }}>
        ※ 크롬 브라우저 권장 · 모바일은 일부 기능이 제한될 수 있습니다.
      </p>
    </div>
  );
}
