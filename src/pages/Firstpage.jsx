import { Link } from "react-router-dom";

export default function Firstpage() {
  return (
    <div className="fixed-container">
      <style>{`
        /* ✅ 1. 페이지 전체 초기화 */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100%;
          height: 100%;
          background-color: #060b24;
          overflow: hidden;
        }

        /* ✅ 2. 메인 컨테이너 (여기를 수정했습니다) */
        .fixed-container {
          width: 100vw;
          height: 100vh;
          
          display: flex;
          flex-direction: column;
          align-items: center;
          
          /* ▼▼▼ 기존 center를 지우고 아래 두 줄로 변경 ▼▼▼ */
          justify-content: flex-start; /* 1. 무조건 위에서부터 시작 */
          padding-top: 7vh;           /* 2. 위에서 13%만큼 내려서 위치 잡음 */
          
          background-color: #060b24;
        }

        /* ✅ 3. 타이틀 이미지 */
        .title-img {
          width: auto;
          height: auto;
          max-width: 80%;
          max-height: 25vh;
          
          object-fit: contain;
          margin-bottom: -3vh;
        }

        /* ✅ 4. 시작하기 버튼 */
        .start-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          
          padding: 1.5vh 3vw; 
          font-size: clamp(16px, 3vh, 32px);
          
          background: #3b82f6;
          border-radius: 50px;
          color: #fff;
          font-weight: 900;
          text-decoration: none;
          border: 2px solid #60a5fa;
          box-shadow: 0 0 20px #1e40af70;
          transition: all .2s ease;
          
          position: relative;
          z-index: 100;
          
          /* 사용자 설정 유지 */
          margin-top: 6vh;      
          margin-bottom: -12vh; 
        }

        /* ✅ 5. 캐릭터 이미지 */
        .char-img {
          width: auto;
          height: auto;
          max-width: 90%;
          max-height: 55vh;
          
          object-fit: contain;
          margin-top: 0; 
          pointer-events: none;
        }

        /* ✅ 6. 하단 안내문 */
        .info-text {
          position: absolute;
          bottom: 4vh;
          
          margin: 0;
          font-size: clamp(11px, 1.5vh, 16px);
          color: #cbd5e1;
          opacity: 0.6;
          z-index: 11;
        }
      `}</style>

      {/* 컨텐츠 영역 */}
      <img src="/title.png" alt="타이틀" className="title-img" />
      
      <Link to="/start" className="start-btn">
        시작하기
      </Link>
      
      <img src="/characters.png" alt="캐릭터" className="char-img" />
      
      <p className="info-text">
        ※ 크롬 브라우저 권장 · 모바일 환경에서는 기능이 제한될 수 있습니다.
      </p>
    </div>
  );
}