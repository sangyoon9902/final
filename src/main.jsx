// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppProvider } from "./state/AppState";

import App from "./App";
import Firstpage from "./pages/Firstpage.jsx";  // ✅ 첫 화면
import Start from "./pages/Start.jsx";
import Select from "./pages/Select.jsx";
import Results from "./pages/Results.jsx";

import MeasureSitUp from "./pages/MeasureSitUp.jsx";
import MeasureReach from "./pages/MeasureSitAndReach.jsx";
import MeasureStep from "./pages/MeasureStep.jsx";

import Survey1 from "./pages/survey1.jsx";
import Survey2 from "./pages/survey2.jsx";
import Survey3 from "./pages/survey3.jsx";
import Survey4 from "./pages/survey4.jsx";
import Review from "./pages/Review.jsx";
import MyResult from "./pages/MyResult.jsx";

// 라우터 정의
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // 공통 레이아웃 (헤더 + Outlet)
    children: [
      // ✅ 루트(/) 첫 화면: FirstPage
      { index: true, element: <Firstpage /> },

      // ✅ 시작하기 버튼이 이동할 페이지: /start → 개인정보 입력
      { path: "start", element: <Start /> },

      { path: "select", element: <Select /> },
      { path: "results", element: <Results /> },

      // 측정 페이지들
      // ⚠️ App.jsx에서 measure 경로 체크가 "/measure/situp" 이면,
      // 여기 path도 "measure/situp"처럼 소문자로 맞춰주는 게 좋음
      { path: "measure/situp", element: <MeasureSitUp /> },
      { path: "measure/reach", element: <MeasureReach /> },
      { path: "measure/step", element: <MeasureStep /> },

      // 설문 페이지들
      { path: "survey1", element: <Survey1 /> },
      { path: "survey2", element: <Survey2 /> },
      { path: "survey3", element: <Survey3 /> },
      { path: "survey4", element: <Survey4 /> },

      { path: "review", element: <Review /> },
      { path: "my", element: <MyResult /> },
    ],
  },
]);

// ✅ StrictMode 제거 (useEffect 중복 실행 방지)
ReactDOM.createRoot(document.getElementById("root")).render(
  <AppProvider>
    <RouterProvider router={router} />
  </AppProvider>
);
