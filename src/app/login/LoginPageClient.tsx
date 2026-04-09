"use client"; // 這個頁面在瀏覽器端執行，因為要使用 React hook、Firebase Auth 與網址參數

import { useEffect, useMemo, useState } from "react"; // 匯入 React 需要的 hook
import Link from "next/link"; // 匯入 Next.js 的 Link 元件
import { useSearchParams } from "next/navigation"; // 匯入網址查詢參數 hook
import { signInWithEmailAndPassword } from "firebase/auth"; // 匯入 Firebase Email / Password 登入方法
import { auth } from "../../lib/firebase"; // 匯入前端 Firebase Auth 實例

export default function LoginPageClient() { // 建立統一登入頁元件
  const searchParams = useSearchParams(); // 取得目前網址查詢參數
  const flow = useMemo(() => searchParams.get("flow") || "system_login", [searchParams]); // 取得目前流程，預設為系統登入
  const lineError = useMemo(() => searchParams.get("lineError"), [searchParams]); // 取得 lineError 錯誤參數
  const popup = useMemo(() => searchParams.get("popup"), [searchParams]); // 取得 popup 參數，判斷是否為子視窗登入

  const [emailLoading, setEmailLoading] = useState(false); // 控制 Email / Password 登入中的狀態
  const [error, setError] = useState(""); // 儲存頁面錯誤訊息
  const [email, setEmail] = useState(""); // 儲存 Email 欄位內容
  const [password, setPassword] = useState(""); // 儲存密碼欄位內容

  const title = flow === "manager_bind" ? "協助人員登入" : "廠商後台登入"; // 依流程切換頁面標題
  const description = flow === "manager_bind" // 依流程切換頁面說明文字
    ? "受邀的協助管理人員，可先使用 Email / Password 登入。" // manager_bind 的說明
    : "主帳號或尚未綁定 LINE 的管理人員，可先使用 Email / Password 登入。"; // 一般系統登入的說明

  useEffect(() => { // 監聽頁面恢復顯示時的事件，避免從外部頁面返回後登入頁卡住
    const handlePageShow = (event: PageTransitionEvent) => { // 建立 pageshow 事件處理函式
      const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined; // 取得這次導覽資訊
      const isBackForward = navEntry?.type === "back_forward"; // 判斷是否為瀏覽器返回/前進造成的頁面恢復

      if (event.persisted || isBackForward) { // 若是 bfcache 恢復或 back_forward 導覽
        window.location.reload(); // 直接強制重新整理登入頁，避免網址變了但畫面沒切換
        return; // 中止後續處理
      } // 返回快取判斷結束

      setEmailLoading(false); // 一般情況下清空 Email 登入中狀態
    }; // handlePageShow 函式結束

    window.addEventListener("pageshow", handlePageShow); // 監聽 pageshow 事件

    return () => { // 元件卸載時執行清理
      window.removeEventListener("pageshow", handlePageShow); // 移除 pageshow 監聽
    }; // 清理結束
  }, []); // 只在首次掛載時建立監聽

  useEffect(() => { // 補強：若先前跳去外部頁或返回快取，重新進入登入頁時一律檢查是否需重整
    const needReload = sessionStorage.getItem("force_reload_after_back"); // 讀取離站前記錄的旗標
    if (needReload === "1") { // 若存在需要重整的旗標
      sessionStorage.removeItem("force_reload_after_back"); // 先移除旗標避免無限重整
      const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined; // 取得導覽資訊
      if (navEntry?.type === "back_forward") { // 若確實是瀏覽器返回
        window.location.reload(); // 強制重新整理登入頁
      } // 返回判斷結束
    } // 旗標判斷結束
  }, []); // 只在首次掛載時執行一次

  const handleEmailLogin = async () => { // 建立 Email / Password 登入函式
    try { // 開始錯誤捕捉
      setEmailLoading(true); // 設定為 Email 登入中
      setError(""); // 清空舊錯誤訊息

      const trimmedEmail = email.trim(); // 去除 Email 前後空白
      const trimmedPassword = password.trim(); // 去除密碼前後空白

      if (!trimmedEmail) { // 若 Email 空白
        setError("請輸入 Email"); // 顯示錯誤訊息
        setEmailLoading(false); // 結束 loading
        return; // 中止流程
      } // Email 檢查結束

      if (!trimmedPassword) { // 若密碼空白
        setError("請輸入密碼"); // 顯示錯誤訊息
        setEmailLoading(false); // 結束 loading
        return; // 中止流程
      } // 密碼檢查結束

      await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword); // 使用 Firebase Auth 進行 Email / Password 登入

      if (popup === "1" && window.opener && !window.opener.closed) { // 若目前是從 managers 開啟的登入子視窗
        const openerUrl = new URL("/managers", window.location.origin); // 建立主頁 managers URL
        openerUrl.searchParams.set("popupLoginDone", "1"); // 帶回 popupLoginDone
        openerUrl.searchParams.set("t", String(Date.now())); // 加時間戳確保主頁更新
        window.opener.location.replace(openerUrl.toString()); // 導回主頁
        window.close(); // 關閉自己
        return; // 中止後續流程
      } // popup 登入流程結束

      if (flow === "manager_bind") { // 若目前流程是協助人員加入
        window.location.href = "/managers"; // 先導回 managers 頁
        return; // 中止後續流程
      } // manager_bind 流程結束

      window.location.href = "/managers"; // 系統登入成功後先導回 managers 頁，後續可再改成 dashboard
    } catch (e) { // 若登入失敗
      console.error("handleEmailLogin error:", e); // 印出錯誤
      setError("Email / Password 登入失敗"); // 顯示錯誤訊息
    } finally { // 不論成功或失敗最後都執行
      setEmailLoading(false); // 結束 Email 登入中狀態
    } // finally 結束
  }; // handleEmailLogin 函式結束

  return ( // 回傳畫面開始
    <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center"> {/* 最外層畫面容器 */}
      <div className="w-full max-w-3xl rounded-3xl bg-white border shadow-sm overflow-hidden"> {/* 主卡片容器 */}
        <div className="p-8"> {/* 內容區塊 */}
          <div className="mb-4"> {/* 返回鍵區塊 */}
            <Link
              href="/managers"
              className="inline-flex items-center justify-center rounded-xl border-2 border-gray-400 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50"
            >
              返回上一頁
            </Link>
          </div>

          <h1 className="text-4xl font-bold mb-4">{title}</h1> {/* 主標題 */}
          <p className="text-gray-500 mb-6">{description}</p> {/* 說明文字 */}

          {(error || lineError) && ( // 若有頁面錯誤或 LINE callback 錯誤則顯示
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-red-600">
              {error || lineError}
            </div>
          )} {/* 錯誤顯示結束 */}

          <div className="rounded-2xl bg-gray-50 border p-6"> {/* Email / Password 區塊 */}
            <p className="text-sm text-gray-500 mb-4"> {/* 區塊說明 */}
              登入後可直接綁定或進入系統。若主帳號或管理人員尚未綁定 LINE，可先用 Email / Password 登入。
            </p>

            <div className="space-y-4"> {/* 表單欄位容器 */}
              <div> {/* Email 欄位區塊 */}
                <label className="block text-sm font-medium mb-2">Email</label> {/* Email 標籤 */}
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="請輸入 Email"
                  className="w-full rounded-xl border px-4 py-3"
                />
              </div>

              <div> {/* 密碼欄位區塊 */}
                <label className="block text-sm font-medium mb-2">密碼</label> {/* 密碼標籤 */}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入密碼"
                  className="w-full rounded-xl border px-4 py-3"
                />
              </div>

              <button
                type="button"
                onClick={handleEmailLogin}
                disabled={emailLoading}
                className="w-full rounded-xl bg-slate-900 text-white py-4 text-lg font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {emailLoading ? "登入中..." : "Email / Password 登入"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  ); // 畫面回傳結束
} // 元件結束