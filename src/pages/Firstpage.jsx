import { Link } from "react-router-dom";

export default function Firstpage() {
  return (
    <div
      style={{
        maxWidth: 1100,        // ⬆ 크기 확장
        margin: "0 auto",
        padding: "70px 20px",  // ⬆ 여백 확대
        textAlign: "center",
        color: "#fff",
      }}
    >
      {/* ====== 타이틀 영역 ====== */}
      <img
        src="/title.png"
        alt="서비스 타이틀"
        style={{
          width: "100%",
          maxWidth: 600,       // ⬆ 타이틀 확대
          margin: "0 auto 20px",
          marginTop: "-20px",
          display: "block",
        }}
      />

      {/* ====== 시작하기 버튼 ====== */}
      <Link
        to="/start"
        style={{
          display: "inline-block",
          padding: "18px 80px",  // ⬆ 버튼 크기 확대
          background: "#3b82f6",
          borderRadius: 25,
          color: "#fff",
          fontSize: 40,          // ⬆ 폰트 크게
          fontWeight: 900,
          textDecoration: "none",
          border: "2px solid #60a5fa",
          boxShadow: "0 0 20px #1e40af70",
          transition: "all .2s ease",
          marginTop: "0px", 
          marginBottom: "-100px",
        }}
      >
        시작하기
      </Link>

      {/* ====== 캐릭터 이미지 영역 ====== */}
      <img
        src="/characters.png"
        alt="캐릭터 이미지"
        style={{
          width: "100%",
          maxWidth: 820,   
          marginTop: "-100px", 
          marginBottom: "0px",   // ⬆ 캐릭터 이미지 확대
          margin: "20px auto 0",
          display: "block",
        }}
      />

      {/* 안내문 */}
      <p
        style={{
          marginTop: 0,
          fontSize: 20,        // ⬆ 텍스트 가독성 증가
          color: "#cbd5e1",
        }}
      >
        ※ 크롬 브라우저 권장 · 모바일 환경에서는 기능이 제한될 수 있습니다.
      </p>
    </div>
  );
}
