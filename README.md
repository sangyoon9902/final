<p align="center">
  <img src="./assets/banner.png" width="800" />
</p>

<h1 align="center">🏋️‍♂️ AI Fitness Service</h1>

<p align="center">
AI 기반 비대면 자가체력측정 · 국민체력 100 기반 운동처방 플랫폼
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/React-Vite-blue" /></a>
  <a href="#"><img src="https://img.shields.io/badge/FastAPI-Backend-green" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Supabase-Database-3FCF8E" /></a>
</p>


# 🏋️‍♂️ AI Fitness Service (AI 기반 비대면 운동처방 플랫폼)

> **국민체력 100** 기반의 체력 측정을 온라인에서 수행하고, AI가 개인 맞춤형 운동을 처방해주는 웹 서비스입니다.

## 📖 프로젝트 개요
**AI Fitness**는 시공간의 제약 없이 사용자가 스스로 체력을 측정하고 관리할 수 있도록 돕는 플랫폼입니다. 노트북/데스크탑의 웹캠을 활용한 자세 분석과 웨어러블 기기(심박수) 연동을 통해 정밀한 데이터를 수집하며, 이를 바탕으로 RAG 기반의 생성형 AI가 전문적인 운동 처방을 제공합니다.

* **권장 환경:** Chrome 브라우저 (Webcam 필수)
* **지원 기기:** Desktop / Laptop (모바일 미지원)
---
## 🧩 서비스 흐름도 (Service Flow)
<img width="1952" height="1073" alt="image" src="https://github.com/user-attachments/assets/019129a3-fd86-4a88-8343-eab616bb16e9" />


---

## 🛠 시스템 아키텍처 (System Architecture)

### 1. Frontend (User Interface)
* **Stack:** React, Vite, Vercel
* **Key Features:**
    * **MediaPipe:** 윗몸일으키기, 좌전굴 등 실시간 자세 추정 및 분석
    * **Pulsoid:** 실시간 심박수 데이터 연동 및 스텝검사 구현
    * **Visualization:** Canvas API를 활용한 실시간 그래프 렌더링
    * **State Management:** Zustand를 통한 효율적인 전역 상태 관리
    * **Structure:** React Router 기반의 SPA(Single Page Application) 구조

### 2. Backend API (Server)
* **Stack:** FastAPI, Render
* **Key Features:**
    * **REST API:** 측정 데이터 처리 및 AI 처방 생성 요청 핸들링
    * **Stable & Secure:** 환경변수 관리 및 CORS 정책 적용
    * **ORM:** SQLAlchemy를 활용한 데이터베이스 연결 및 객체 매핑

### 3. Database
* **Stack:** Supabase (PostgreSQL)
* **Structure:**
    * **User/Result:** 사용자 정보(`DBUser`) 및 측정 결과(`DBResult`) 구조화 저장
    * **JSON Data:** 비정형 데이터(처방 내용, 설문, 리뷰)를 JSON 필드로 유연하게 관리

### 4. AI RAG Engine (Exercise Prescription)
* **Model:** OpenAI GPT-4o-mini
* **Logic:**
    * **RAG (Retrieval-Augmented Generation):** KSPO 체력처방 데이터, 동영상 메타데이터, ACSM 가이드라인 등을 지식 베이스로 활용
    * **Process:** 유사도 검색(kNN) → 운동 빈도/강도(FITT) 분석 → 4주 운동 플랜 및 운동 카드 자동 생성

---


