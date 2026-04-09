"use client"; // 這個頁面在瀏覽器端執行，因為要使用 useEffect 進行前端跳轉

import { useEffect } from "react"; // 匯入 React 的 useEffect hook

export default function ManagerLineBindRedirectPage() { // 建立 managers/line-bind 轉址頁元件
  useEffect(() => { // 頁面掛載後立即執行前端跳轉
    window.location.replace(`/login?flow=manager_bind&t=${Date.now()}`); // 直接跳到共用登入頁，並加上時間戳避免快取殘留
  }, []); // 只在首次掛載時執行一次

  return ( // 回傳簡單中的畫面
    <main className="min-h-screen flex items-center justify-center bg-gray-50"> {/* 最外層容器 */}
      <div className="rounded-2xl border bg-white px-6 py-5 shadow-sm"> {/* 轉址提示卡片 */}
        正在前往登入頁... {/* 提示文字 */}
      </div>
    </main>
  ); // 畫面回傳結束
} // 元件結束