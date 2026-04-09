import { Suspense } from "react"; // 匯入 React 的 Suspense 元件，讓 useSearchParams 所在的 Client 元件可被包覆
import LoginPageClient from "./LoginPageClient"; // 匯入真正的 login Client 頁面元件

export default function LoginPage() { // 建立 login 的 Server Component 外殼頁面
  return ( // 回傳畫面開始
    <Suspense
      fallback={ // 設定 Suspense 載入中的替代畫面
        <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center"> {/* 最外層容器 */}
          <div className="w-full max-w-3xl rounded-3xl bg-white border shadow-sm overflow-hidden"> {/* 主卡片容器 */}
            <div className="p-8"> {/* 內容區塊 */}
              <div className="rounded-xl bg-gray-50 border p-4 text-gray-600">讀取中...</div> {/* 載入提示 */}
            </div> {/* 內容區塊結束 */}
          </div> {/* 主卡片容器結束 */}
        </main> // 最外層容器結束
      } // fallback 結束
    >
      <LoginPageClient /> {/* 真正的 Client 頁面，裡面可以安全使用 useSearchParams */}
    </Suspense> // Suspense 結束
  ); // 回傳畫面結束
} // 元件結束