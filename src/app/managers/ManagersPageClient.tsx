"use client"; // 宣告此檔為 Client Component，因為會使用瀏覽器 API 與 React hook

import { useCallback, useEffect, useMemo, useRef, useState } from "react"; // 匯入 React 常用 hook
import { usePathname, useRouter, useSearchParams } from "next/navigation"; // 匯入 Next.js 路由相關 hook

const LINE_START_API = "/api/line/start"; // LINE 啟動 API 路徑
const MANAGERS_LIST_API = "/api/vendor/managers/list"; // 協助人員名單 API 正式路徑
const MANAGER_LOGIN_PATH = "/login?flow=manager_bind"; // 帳號密碼登入頁路徑

type ManagerMember = { // 定義協助人員資料型別
  id: string; // 唯一 ID
  role?: string; // 角色
  name?: string; // 名稱
  email?: string; // Email
  lineUserId?: string; // LINE userId
  lineDisplayName?: string; // LINE 顯示名稱
  linePictureUrl?: string; // LINE 頭像網址
  createdAt?: string; // 建立時間文字
}; // 型別結束

function isMobileDevice(): boolean { // 判斷是否為手機或平板裝置
  if (typeof window === "undefined") return false; // 若不在瀏覽器環境則直接回 false
  const ua = window.navigator.userAgent || ""; // 取得 User-Agent
  return /iPhone|iPad|iPod|Android|Mobile|Windows Phone/i.test(ua); // 以 UA 關鍵字判斷是否為行動裝置
} // 函式結束

function isLineInAppBrowser(): boolean { // 判斷是否在 LINE 內建瀏覽器
  if (typeof window === "undefined") return false; // 若不在瀏覽器環境則直接回 false
  const ua = window.navigator.userAgent || ""; // 取得 User-Agent
  return /Line\//i.test(ua) || /LIFF/i.test(ua); // 若含 LINE 或 LIFF 字樣則視為 LINE 內建瀏覽器
} // 函式結束

function buildNoticeStorageKey(pathname: string, noticeType: string, displayName: string): string { // 建立提醒防重複 key
  return `managers_notice_handled:${pathname}:${noticeType}:${displayName}`; // 回傳唯一 key
} // 函式結束

function removeLineResultQuery(pathname: string, searchParams: URLSearchParams): string { // 建立移除 LINE 回傳 query 後的新網址
  const nextParams = new URLSearchParams(searchParams.toString()); // 複製目前 query
  nextParams.delete("lineSuccess"); // 移除 lineSuccess
  nextParams.delete("lineExists"); // 移除 lineExists
  nextParams.delete("lineDisplayName"); // 移除 lineDisplayName
  nextParams.delete("lineError"); // 移除 lineError
  nextParams.delete("popupDone"); // 移除 popupDone
  const nextQuery = nextParams.toString(); // 重組 query
  return nextQuery ? `${pathname}?${nextQuery}` : pathname; // 若還有其他 query 就保留，否則只回路徑
} // 函式結束

async function readSafeResponseMessage(response: Response): Promise<string> { // 安全讀取 API 錯誤訊息
  const contentType = response.headers.get("content-type") || ""; // 取得 content-type
  const rawText = await response.text(); // 先以文字讀取回應內容

  if (contentType.includes("application/json")) { // 若回應是 JSON
    try { // 嘗試解析 JSON
      const json = JSON.parse(rawText); // 將文字轉成 JSON
      return String(json?.error || json?.message || "伺服器回傳錯誤"); // 優先取 error 或 message
    } catch { // 若 JSON 解析失敗
      return "伺服器回傳格式錯誤"; // 回傳格式錯誤提示
    } // 解析區塊結束
  } // JSON 分支結束

  if (contentType.includes("text/html")) { // 若伺服器回傳 HTML
    return "API 路徑不存在或伺服器回傳了網頁內容，不是 JSON 資料。"; // 回傳安全簡短訊息
  } // HTML 分支結束

  return rawText || "發生未預期錯誤"; // 其餘情況直接回傳文字或預設訊息
} // 函式結束

export default function ManagersPageClient() { // 匯出 managers 主頁元件
  const router = useRouter(); // 取得 router
  const pathname = usePathname(); // 取得目前路徑
  const searchParams = useSearchParams(); // 取得目前 query 參數

  const [members, setMembers] = useState<ManagerMember[]>([]); // 儲存協助人員名單
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(false); // 控制名單讀取狀態
  const [isStartingLine, setIsStartingLine] = useState<boolean>(false); // 控制 LINE 啟動中狀態
  const [noticeTitle, setNoticeTitle] = useState<string>("提醒"); // 控制提醒視窗標題
  const [noticeText, setNoticeText] = useState<string>(""); // 控制提醒視窗內容
  const [showNoticeDialog, setShowNoticeDialog] = useState<boolean>(false); // 控制提醒視窗顯示狀態
  const [pageError, setPageError] = useState<string>(""); // 控制頁面錯誤訊息
  const [pageInfo, setPageInfo] = useState<string>(""); // 控制頁面一般提示訊息
  const [currentVendorId, setCurrentVendorId] = useState<string>(""); // 儲存目前實際使用的 vendorId
  const [vendorDocMissing, setVendorDocMissing] = useState<boolean>(false); // 記錄是否找不到 Investors3 主文件

  const hasHandledLineResultRef = useRef<boolean>(false); // 保證本輪進頁只處理一次 LINE 回傳結果
  const pendingNoticeStorageKeyRef = useRef<string>(""); // 暫存本次提醒對應的 sessionStorage key
  const popupWindowRef = useRef<Window | null>(null); // 暫存 popup 視窗參考
  const currentQueryString = useMemo(() => searchParams?.toString() || "", [searchParams]); // 將 searchParams 轉成穩定字串

  const fetchMembers = useCallback(async () => { // 定義讀取協助人員名單的方法
    setIsLoadingMembers(true); // 開始讀取時開啟 loading
    setPageError(""); // 清空舊錯誤
    setPageInfo(""); // 清空舊提示
    setVendorDocMissing(false); // 先清空找不到主文件狀態

    try { // 進入錯誤處理區塊
      const response = await fetch(MANAGERS_LIST_API, { // 呼叫正式 managers list API，讓後端自己從 BOOTSTRAP_VENDOR_ID 判斷
        method: "GET", // 使用 GET
        cache: "no-store", // 不快取
        credentials: "same-origin", // 保留同站 session
      }); // 呼叫結束

      if (!response.ok) { // 若 HTTP 狀態非成功
        const message = await readSafeResponseMessage(response); // 讀取安全錯誤文字
        throw new Error(message || "讀取協助人員名單失敗"); // 丟出錯誤
      } // 判斷結束

      const data = await response.json(); // 解析 JSON
      const resolvedVendorId = String(data?.vendorId || ""); // 取出後端實際使用的 vendorId
      const notFoundVendor = Boolean(data?.notFoundVendor); // 取出是否找不到主文件
      const rawMembers = Array.isArray(data?.members) ? data.members : []; // 取出 members 陣列

      const normalizedMembers: ManagerMember[] = rawMembers.map((item: any) => ({ // 正規化資料欄位
        id: String(item?.id ?? item?.docId ?? item?.memberId ?? ""), // 取出 ID
        role: item?.role ?? "", // 取出角色
        name: item?.name ?? item?.displayName ?? item?.lineDisplayName ?? "", // 取出名稱
        email: item?.email ?? "", // 取出 Email
        lineUserId: item?.lineUserId ?? "", // 取出 LINE userId
        lineDisplayName: item?.lineDisplayName ?? "", // 取出 LINE 顯示名稱
        linePictureUrl: item?.linePictureUrl ?? "", // 取出頭像
        createdAt: item?.createdAt ?? item?.createdAtText ?? "", // 取出建立時間
      })); // map 結束

      setCurrentVendorId(resolvedVendorId); // 記錄目前實際使用的 vendorId
      setVendorDocMissing(notFoundVendor); // 記錄是否找不到主文件
      setMembers(normalizedMembers); // 更新名單

      if (resolvedVendorId) { // 若有實際 vendorId
        setPageInfo(`目前廠商：${resolvedVendorId}`); // 顯示目前使用的 vendorId
      } // 判斷結束
    } catch (error: any) { // 捕捉讀取錯誤
      setMembers([]); // 發生錯誤時清空名單
      setCurrentVendorId(""); // 清空 vendorId
      setVendorDocMissing(false); // 清空狀態
      setPageError(error?.message || "讀取協助人員名單時發生錯誤"); // 顯示錯誤訊息
    } finally { // 無論成功失敗都執行
      setIsLoadingMembers(false); // 關閉 loading 狀態
    } // finally 結束
  }, []); // callback 結束

  const cleanLineResultFromUrl = useCallback(() => { // 定義清理 LINE 回傳 query 的方法
    if (typeof window === "undefined") return; // 若不在瀏覽器環境就不處理
    const currentParams = new URLSearchParams(window.location.search); // 取得目前 query
    const cleanUrl = removeLineResultQuery(pathname || "/managers", currentParams); // 產生清理後網址
    window.history.replaceState({}, "", cleanUrl); // 用 replaceState 清理網址，不新增歷史紀錄
  }, [pathname]); // 依賴 pathname

  const openNoticeDialog = useCallback((title: string, text: string, storageKey: string) => { // 定義開啟提醒視窗的方法
    setNoticeTitle(title); // 設定提醒標題
    setNoticeText(text); // 設定提醒內容
    pendingNoticeStorageKeyRef.current = storageKey; // 暫存提醒 key
    setShowNoticeDialog(true); // 顯示提醒視窗
  }, []); // callback 結束

  const handleNoticeConfirm = useCallback(() => { // 定義按下提醒視窗確定按鈕時的處理
    if (typeof window !== "undefined" && pendingNoticeStorageKeyRef.current) { // 若在瀏覽器且有 key
      window.sessionStorage.setItem(pendingNoticeStorageKeyRef.current, "1"); // 將本次提醒標記為已處理
    } // 判斷結束

    setShowNoticeDialog(false); // 關閉提醒視窗
    setNoticeTitle("提醒"); // 還原標題
    setNoticeText(""); // 清空內容
    pendingNoticeStorageKeyRef.current = ""; // 清空暫存 key
    cleanLineResultFromUrl(); // 清除網址中的 LINE 回傳參數
  }, [cleanLineResultFromUrl]); // 依賴清理網址方法

  const startLineBind = useCallback(async () => { // 定義啟動 LINE 綁定的方法
    setIsStartingLine(true); // 開始時顯示啟動中
    setPageError(""); // 清空舊錯誤

    try { // 進入錯誤處理
      const shouldUseSameTab = isMobileDevice() || isLineInAppBrowser(); // 手機與 LINE 內建瀏覽器一律同頁跳轉
      const flow = "manager_bind"; // 指定目前流程
      const url = `${LINE_START_API}?flow=${encodeURIComponent(flow)}&preferSameTab=${shouldUseSameTab ? "1" : "0"}`; // 不再寫死 vendorId，改由後端用 BOOTSTRAP_VENDOR_ID 判斷

      const response = await fetch(url, { // 呼叫 start API
        method: "GET", // 使用 GET
        cache: "no-store", // 不快取
        credentials: "same-origin", // 保留同站 session
      }); // 呼叫結束

      if (!response.ok) { // 若回傳非成功
        const message = await readSafeResponseMessage(response); // 安全讀取錯誤訊息
        throw new Error(message || "啟動 LINE 綁定失敗"); // 丟出錯誤
      } // 判斷結束

      const contentType = response.headers.get("content-type") || ""; // 取得 content-type
      if (!contentType.includes("application/json")) { // 若不是 JSON
        throw new Error("LINE start API 沒有回傳 JSON，請檢查 start route。"); // 丟出錯誤
      } // 判斷結束

      const data = await response.json(); // 解析 JSON
      const loginUrl = String(data?.loginUrl || ""); // 取出 loginUrl
      const mode = String(data?.mode || "normal"); // 取出 mode
      const preferSameTab = Boolean(data?.preferSameTab ?? shouldUseSameTab); // 取出是否同頁

      if (!loginUrl) { // 若沒有 loginUrl
        throw new Error("LINE 綁定網址不存在"); // 丟出錯誤
      } // 判斷結束

      if (preferSameTab) { // 若應使用同頁
        window.location.href = loginUrl; // 同頁導向
        return; // 結束
      } // 同頁分支結束

      if (mode === "qr") { // 若桌機模式為 qr
        const popupWidth = 520; // popup 寬度
        const popupHeight = 760; // popup 高度
        const popupLeft = Math.max(window.screenX + (window.outerWidth - popupWidth) / 2, 0); // 計算左側位置
        const popupTop = Math.max(window.screenY + (window.outerHeight - popupHeight) / 2, 0); // 計算上方位置
        const popupFeatures = `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`; // popup 參數

        if (popupWindowRef.current && !popupWindowRef.current.closed) { // 若舊 popup 還存在
          popupWindowRef.current.location.href = loginUrl; // 重用舊 popup
          popupWindowRef.current.focus(); // 聚焦 popup
        } else { // 若沒有舊 popup
          popupWindowRef.current = window.open(loginUrl, "lineLoginPopup", popupFeatures); // 開新 popup
        } // 分支結束

        if (!popupWindowRef.current) { // 若 popup 被瀏覽器擋住
          window.location.href = loginUrl; // 改為同頁跳轉
          return; // 結束
        } // 判斷結束
      } else { // 其餘模式
        window.location.href = loginUrl; // 直接同頁導向
        return; // 結束
      } // mode 分支結束
    } catch (error: any) { // 捕捉錯誤
      setPageError(error?.message || "LINE 綁定啟動失敗"); // 顯示錯誤訊息
    } finally { // 無論成功失敗都執行
      setIsStartingLine(false); // 關閉啟動中狀態
    } // finally 結束
  }, []); // callback 結束

  useEffect(() => { // 頁面初次載入時讀取名單
    fetchMembers(); // 執行讀取
  }, [fetchMembers]); // effect 結束

  useEffect(() => { // 監聽 popup callback 成功後從小視窗傳回主頁的訊息
    if (typeof window === "undefined") return; // 若不在瀏覽器環境則不處理

    const onMessage = async (event: MessageEvent) => { // 建立 message 事件處理函式
      if (event.origin !== window.location.origin) return; // 只接受同源訊息
      const payload = event.data; // 取出訊息內容
      if (!payload || payload.source !== "line-manager-bind-callback") return; // 只接受指定來源訊息

      const lineDisplayName = String(payload.lineDisplayName || ""); // 取出 LINE 顯示名稱
      const resultType = String(payload.resultType || "success"); // 取出結果類型

      await fetchMembers(); // 先重新讀取名單，確保主頁資料最新

      if (resultType === "exists") { // 若是已存在
        const storageKey = buildNoticeStorageKey(pathname || "/managers", "exists", lineDisplayName || "empty"); // 建立已存在提醒 key
        openNoticeDialog("提醒", lineDisplayName ? `這個 LINE 帳號（${lineDisplayName}）已經加入協助管理人員了。` : "這個 LINE 帳號已經加入協助管理人員了。", storageKey); // 顯示已存在提醒
        return; // 結束處理
      } // 判斷結束

      if (resultType === "success") { // 若是新增成功
        const storageKey = buildNoticeStorageKey(pathname || "/managers", "success", lineDisplayName || "empty"); // 建立成功提醒 key
        openNoticeDialog("提醒", lineDisplayName ? `LINE 帳號（${lineDisplayName}）已成功加入協助管理人員。` : "LINE 帳號已成功加入協助管理人員。", storageKey); // 顯示成功提醒
        return; // 結束處理
      } // 判斷結束

      if (resultType === "error") { // 若是錯誤
        const errorMessage = String(payload.message || "LINE callback 發生錯誤"); // 取出錯誤訊息
        const storageKey = buildNoticeStorageKey(pathname || "/managers", "error", errorMessage); // 建立錯誤提醒 key
        openNoticeDialog("提醒", errorMessage, storageKey); // 顯示錯誤提醒
      } // 判斷結束
    }; // 函式結束

    window.addEventListener("message", onMessage); // 註冊 message 監聽器

    return () => { // 元件卸載時清理監聽器
      window.removeEventListener("message", onMessage); // 移除 message 監聽器
    }; // cleanup 結束
  }, [fetchMembers, openNoticeDialog, pathname]); // effect 依賴

  useEffect(() => { // 處理 LINE 回來後的 query 結果，保證本輪只處理一次
    if (typeof window === "undefined") return; // 若不在瀏覽器環境則不處理
    if (!searchParams) return; // 若 searchParams 尚未準備好則不處理
    if (hasHandledLineResultRef.current) return; // 若本輪已處理過就不再處理

    const lineSuccess = searchParams.get("lineSuccess") || ""; // 讀取成功參數
    const lineExists = searchParams.get("lineExists") || ""; // 讀取已存在參數
    const lineDisplayName = searchParams.get("lineDisplayName") || ""; // 讀取名稱參數
    const lineError = searchParams.get("lineError") || ""; // 讀取錯誤參數

    if (!lineSuccess && !lineExists && !lineError) return; // 若沒有 LINE 回傳結果就不處理

    hasHandledLineResultRef.current = true; // 標記本輪已處理

    let text = ""; // 宣告提醒內容
    if (lineSuccess === "1") { // 若綁定成功
      text = lineDisplayName ? `LINE 帳號（${lineDisplayName}）已成功加入協助管理人員。` : "LINE 帳號已成功加入協助管理人員。"; // 組出成功訊息
    } else if (lineExists === "1") { // 若帳號已存在
      text = lineDisplayName ? `這個 LINE 帳號（${lineDisplayName}）已經加入協助管理人員了。` : "這個 LINE 帳號已經加入協助管理人員了。"; // 組出已存在訊息
    } else if (lineError) { // 若有錯誤參數
      text = decodeURIComponent(lineError); // 解碼錯誤訊息
    } // 判斷結束

    const noticeType = lineSuccess === "1" ? "success" : lineExists === "1" ? "exists" : "error"; // 決定通知類型
    const storageKey = buildNoticeStorageKey(pathname || "/managers", noticeType, lineDisplayName || lineError || "empty"); // 建立通知 key
    const alreadyHandled = window.sessionStorage.getItem(storageKey) === "1"; // 檢查本工作階段是否已處理過

    if (alreadyHandled) { // 若已處理過
      cleanLineResultFromUrl(); // 直接清掉網址 query
      fetchMembers(); // 重抓名單
      return; // 結束
    } // 判斷結束

    openNoticeDialog("提醒", text, storageKey); // 顯示提醒視窗
    fetchMembers(); // 同步重抓名單
  }, [searchParams, pathname, currentQueryString, cleanLineResultFromUrl, openNoticeDialog, fetchMembers]); // effect 依賴

  return ( // 回傳頁面 JSX
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6"> {/* 頁面外框 */}
      <div className="mb-6 flex items-center justify-between gap-3"> {/* 標題列 */}
        <div> {/* 左側標題區 */}
          <div className="text-sm text-blue-700">Performance 後台</div> {/* 小標題 */}
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">協助人員管理</h1> {/* 主標題 */}
          <p className="mt-3 text-base leading-7 text-slate-600">這裡先測試讀取與 LINE 綁定 Investors3 / members 協助人員資料。</p> {/* 說明文字 */}
        </div> {/* 左側標題區結束 */}

        <button
          type="button" // 設定按鈕型別
          onClick={() => router.push("/dashboard")} // 點擊返回首頁
          className="rounded-3xl border-4 border-slate-400 bg-white px-6 py-4 text-2xl font-extrabold text-slate-900 shadow-sm transition hover:bg-slate-50" // 按鈕樣式
        >
          返回首頁 {/* 按鈕文字 */}
        </button> {/* 返回首頁按鈕結束 */}
      </div> {/* 標題列結束 */}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3"> {/* 操作按鈕區 */}
        <button
          type="button" // 設定按鈕型別
          onClick={startLineBind} // 點擊啟動 LINE 綁定
          disabled={isStartingLine || vendorDocMissing} // 啟動中或找不到主文件時禁用
          className="rounded-2xl bg-green-600 px-5 py-4 text-lg font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60" // 按鈕樣式
        >
          {isStartingLine ? "LINE 綁定啟動中..." : "前往 LINE 綁定頁"} {/* 動態文字 */}
        </button> {/* LINE 綁定按鈕結束 */}

        <button
          type="button" // 設定按鈕型別
          onClick={() => router.push(MANAGER_LOGIN_PATH)} // 點擊前往帳號密碼登入頁
          className="rounded-2xl border-2 border-slate-400 bg-white px-5 py-4 text-lg font-bold text-slate-700 shadow-sm transition hover:bg-slate-50" // 按鈕樣式
        >
          帳號 / 密碼登入 {/* 按鈕文字 */}
        </button> {/* 帳密登入按鈕結束 */}

        <button
          type="button" // 設定按鈕型別
          onClick={fetchMembers} // 點擊重新讀取名單
          disabled={isLoadingMembers} // 讀取中禁用按鈕
          className="rounded-2xl border-2 border-blue-500 bg-white px-5 py-4 text-lg font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60" // 按鈕樣式
        >
          {isLoadingMembers ? "讀取中..." : "重新讀取名單"} {/* 動態文字 */}
        </button> {/* 重新讀取名單按鈕結束 */}
      </div> {/* 操作按鈕區結束 */}

      {pageError ? ( // 若有頁面錯誤
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"> {/* 錯誤提示框 */}
          {pageError} {/* 顯示錯誤文字 */}
        </div> // 錯誤提示框結束
      ) : null} {/* 沒錯誤則不顯示 */}

      {pageInfo ? ( // 若有頁面資訊
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700"> {/* 資訊提示框 */}
          {pageInfo} {/* 顯示資訊文字 */}
        </div> // 資訊提示框結束
      ) : null} {/* 沒資訊則不顯示 */}

      {vendorDocMissing ? ( // 若找不到 Investors3/{BOOTSTRAP_VENDOR_ID} 主文件
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800"> {/* 警告提示框 */}
          找不到對應廠商文件：{currentVendorId || "未設定"}。請先確認 `.env.local` 的 `BOOTSTRAP_VENDOR_ID` 是否對應到 Firestore `Investors3` 的文件 ID。 {/* 顯示找不到文件提示 */}
        </div> // 警告提示框結束
      ) : null} {/* 若主文件存在則不顯示 */}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"> {/* 名單卡片 */}
        <div className="border-b border-slate-200 px-5 py-4"> {/* 卡片標題列 */}
          <h2 className="text-xl font-extrabold text-slate-900">協助人員名單</h2> {/* 名單標題 */}
          <p className="mt-1 text-sm text-slate-500">目前共 {members.length} 筆資料</p> {/* 筆數 */}
        </div> {/* 卡片標題列結束 */}

        {isLoadingMembers ? ( // 若讀取中
          <div className="px-5 py-8 text-base text-slate-500">名單讀取中...</div> // 顯示讀取中
        ) : vendorDocMissing ? ( // 若找不到主文件
          <div className="px-5 py-8 text-base text-slate-500">因為找不到對應廠商文件，所以不顯示協助人員資料。</div> // 顯示找不到文件說明
        ) : members.length === 0 ? ( // 若沒有資料
          <div className="px-5 py-8 text-base text-slate-500">目前沒有協助人員資料。</div> // 顯示無資料文字
        ) : ( // 若有資料
          <div className="divide-y divide-slate-200"> {/* 名單內容區 */}
            {members.map((member) => { // 逐筆渲染名單
              const displayName = member.name || member.lineDisplayName || "未命名"; // 取顯示名稱
              const pictureUrl = member.linePictureUrl || ""; // 取頭像
              const roleText = member.role || "manager"; // 取角色文字

              return ( // 回傳單筆資料
                <div key={member.id} className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between"> {/* 單筆資料外框 */}
                  <div className="flex min-w-0 items-center gap-4"> {/* 左側資訊區 */}
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100"> {/* 頭像框 */}
                      {pictureUrl ? ( // 若有頭像
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pictureUrl} alt={displayName} className="h-full w-full object-cover" /> // 顯示頭像
                      ) : ( // 若沒有頭像
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-400">無圖</div> // 顯示無圖佔位
                      )} {/* 頭像條件結束 */}
                    </div> {/* 頭像框結束 */}

                    <div className="min-w-0"> {/* 文字資訊區 */}
                      <div className="flex flex-wrap items-center gap-2"> {/* 名稱與角色列 */}
                        <div className="truncate text-lg font-extrabold text-slate-900">{displayName}</div> {/* 名稱 */}
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{roleText}</span> {/* 角色標籤 */}
                      </div> {/* 名稱與角色列結束 */}

                      <div className="mt-2 space-y-1 text-sm text-slate-500"> {/* 詳細資訊區 */}
                        {member.email ? <div>信箱：{member.email}</div> : null} {/* Email */}
                        {member.lineUserId ? <div className="break-all">LINE ID：{member.lineUserId}</div> : null} {/* LINE ID */}
                        {member.createdAt ? <div>建立時間：{member.createdAt}</div> : null} {/* 建立時間 */}
                      </div> {/* 詳細資訊區結束 */}
                    </div> {/* 文字資訊區結束 */}
                  </div> {/* 左側資訊區結束 */}
                </div> // 單筆資料外框結束
              ); // return 結束
            })} {/* map 結束 */}
          </div> // 名單內容區結束
        )} {/* 條件渲染結束 */}
      </div> {/* 名單卡片結束 */}

      {showNoticeDialog ? ( // 若需顯示提醒視窗
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4"> {/* 遮罩 */}
          <div className="w-full max-w-2xl rounded-[32px] bg-white px-7 py-7 shadow-2xl"> {/* Dialog 容器 */}
            <div className="text-4xl font-extrabold text-slate-900">{noticeTitle}</div> {/* 標題 */}
            <div className="mt-8 whitespace-pre-wrap text-2xl leading-[1.9] text-slate-600">{noticeText}</div> {/* 內容 */}
            <div className="mt-10 flex justify-end"> {/* 按鈕列 */}
              <button
                type="button" // 設定按鈕型別
                onClick={handleNoticeConfirm} // 點擊關閉視窗
                className="rounded-[24px] bg-amber-400 px-8 py-5 text-2xl font-bold text-white shadow-sm transition hover:bg-amber-500" // 按鈕樣式
              >
                確定 {/* 按鈕文字 */}
              </button> {/* 確定按鈕結束 */}
            </div> {/* 按鈕列結束 */}
          </div> {/* Dialog 容器結束 */}
        </div> // 遮罩結束
      ) : null} {/* 不顯示時回傳 null */}
    </div> // 頁面外框結束
  ); // JSX 回傳結束
} // 元件結束