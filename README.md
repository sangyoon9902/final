🧩 AI Fitness 서비스 기술 구조 요약

AI Fitness 서비스는 국민체력 100 체력측정을 온라인 환경에서 수행할 수 있도록 개발된 비대면 자가측정·AI 운동처방 플랫폼입니다.
프론트엔드(React), 백엔드(FastAPI), Supabase 데이터베이스, OpenAI GPT 기반 RAG 엔진, Pulsoid 실시간 심박수 연동 등 다양한 기술 요소가 유기적으로 연결되는 구조로 설계되었습니다.

현재 서비스는 Chrome 브라우저 사용을 권장하며, 모바일 환경은 미지원, 노트북·데스크톱 카메라 기반 측정만 가능합니다.

🏗 시스템 아키텍처 개요
<img src="./assets/architecture.png" width="900" />
Frontend (React + Vite, Vercel 배포)

사용자 인터페이스(UI)와 자가측정 기능 제공

Mediapipe 기반 자세 분석(윗몸일으키기·좌전굴)

Pulsoid 실시간 심박 연동 스텝검사

설문 입력, 운동처방 조회

React Router 기반 멀티페이지 구조

Canvas 실시간 그래프 렌더링

Zustand 상태관리

브라우저 특성상 Chrome 환경에서 가장 안정적이며 모바일 미지원

Backend API (FastAPI, Render 배포)

측정 데이터 처리

AI 운동처방 생성 요청

코치 검수(Review) 데이터 관리

SQLAlchemy ORM 기반 DB 연동

환경변수 관리, CORS 정책, 안정적 REST API 구성

Database (Supabase PostgreSQL)

사용자 정보(DBUser), 측정 데이터(DBMeasure), AI 운동처방(DBResult) 저장

JSONB 기반으로 처방·설문·리뷰 데이터 유연하게 관리

CreatedAt/UpdatedAt 자동 관리

AI RAG 운동처방 엔진 (OpenAI GPT-4o-mini 기반)

KSPO 체력처방 CSV 기반 운동 추천

국민체력 100 공식 운동 영상 메타데이터 활용

ACSM6 기준 + FITT 원칙 기반 조정

GPT-4o-mini가 운동카드, 운동 강도, 주의사항, 4주 운동 플랜 자동 생성
