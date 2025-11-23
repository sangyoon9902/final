import { Link } from "react-router-dom";

export default function Firstpage() {
  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "70px 20px",
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
          maxWidth: 650,
          margin: "0 auto 20px", // 중앙 정렬 + 아래 여백
          marginTop: "-20px",
          display: "block",
        }}
      />

      {/* ====== 시작하기 버튼 ====== */}
      <Link
        to="/start"
        style={{
          display: "inline-block",
          padding: "15px 60px",
          background: "#3b82f6",
          borderRadius: 25,
          color: "#fff",
          fontSize: 30,
          fontWeight: 900,
          textDecoration: "none",
          border: "2px solid #60a5fa",
          boxShadow: "0 0 20px #1e40af70",
          transition: "all .2s ease",
          
          // ▼ 수정: 위치 조정 및 클릭 보장
          position: "relative", // z-index를 쓰기 위해 필수
          zIndex: 10,           // 캐릭터 이미지보다 위에 오게 설정
          marginBottom: "-100px", // 캐릭터와 겹치게 하기 위해 유지
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
          maxWidth: 950,
          display: "block",
          
          // ▼ 수정: 마진 설정 정리 (덮어쓰기 방지)
          marginTop: "-140px", 
          marginBottom: "0px",
          marginLeft: "auto",  // 중앙 정렬
          marginRight: "auto", // 중앙 정렬
        }}
      />

      {/* 안내문 */}
      <p
        style={{
          marginTop: 0,
          fontSize: 25,
          color: "#cbd5e1",
          position: "relative", // 혹시 모를 겹침 방지
          zIndex: 11,
        }}
      >
        ※ 크롬 브라우저 권장 · 모바일 환경에서는 기능이 제한될 수 있습니다.
      </p>
    </div>
  );
}