import { Suspense } from "react"; // 匯入 React 的 Suspense 元件，讓 useSearchParams 所在的 Client 元件可被包覆
import ManagersPageClient from "./ManagersPageClient"; // 匯入真正的 managers Client 頁面元件

export default function ManagersPage() { // 建立 managers 的 Server Component 外殼頁面
  return ( // 回傳畫面開始
    <Suspense
      fallback={ // 設定 Suspense 載入中的替代畫面
        <main className="min-h-screen bg-gray-50 p-6"> {/* 最外層容器 */}
          <div className="max-w-5xl mx-auto"> {/* 內容置中容器 */}
            <div className="rounded-xl bg-white border p-4 shadow-sm"> {/* 載入提示卡片 */}
              讀取中... {/* 載入提示文字 */}
            </div> {/* 載入提示卡片結束 */}
          </div> {/* 內容置中容器結束 */}
        </main> // 最外層容器結束
      } // fallback 結束
    >
      <ManagersPageClient /> {/* 真正的 Client 頁面，裡面可以安全使用 useSearchParams */}
    </Suspense> // Suspense 結束
  ); // 回傳畫面結束
} // 元件結束