"use client"; // 宣告這是 Next.js 的 Client Component，因為此頁需要用到瀏覽器 API 與 React hook

import { useCallback, useEffect, useMemo, useRef, useState } from "react"; // 匯入 React 常用 hook
import { usePathname, useRouter, useSearchParams } from "next/navigation"; // 匯入 Next.js 導頁與網址參數 hook

// =====【可依你專案現況調整的 API 路徑常數：開始】===== // 此區是最可能需要依你專案調整的地方
const LINE_START_API = "/api/line/start"; // LINE 登入起始 API 路徑
const MANAGERS_LIST_API = "/api/managers/list"; // 協助人員名單 API 路徑，若你專案不同請只改這裡
const MANAGERS_DELETE_API = "/api/managers/delete"; // 刪除協助人員 API 路徑，若你專案不同請只改這裡
const MANAGER_LOGIN_PATH = "/login?flow=manager_bind"; // 帳號密碼登入頁面路徑
// =====【可依你專案現況調整的 API 路徑常數：結束】===== // 此區結束

type ManagerMember = { // 定義單一協助人員資料型別
  id: string; // Firestore 文件 ID 或清單項目唯一 ID
  role?: string; // 身分角色，例如 owner / manager
  name?: string; // 顯示名稱
  email?: string; // 電子郵件
  lineUserId?: string; // LINE 使用者唯一 ID
  lineDisplayName?: string; // LINE 顯示名稱
  linePictureUrl?: string; // LINE 頭像網址
  createdAt?: string; // 建立時間字串
}; // 型別結束

type NoticeType = "success" | "exists" | "error" | null; // 定義提醒視窗的種類

function isMobileDevice(): boolean { // 判斷是否為手機或平板裝置
  if (typeof window === "undefined") return false; // 若不在瀏覽器環境就直接回傳 false
  const ua = window.navigator.userAgent || ""; // 取得目前瀏覽器的 User-Agent 字串
  return /iPhone|iPad|iPod|Android|Mobile|Windows Phone/i.test(ua); // 用常見裝置關鍵字判斷是否為行動裝置
} // 函式結束

function isLineInAppBrowser(): boolean { // 判斷是否在 LINE 內建瀏覽器中
  if (typeof window === "undefined") return false; // 若不在瀏覽器環境就直接回傳 false
  const ua = window.navigator.userAgent || ""; // 取得目前瀏覽器的 User-Agent 字串
  return /Line\//i.test(ua) || /LIFF/i.test(ua); // 若 UA 含有 LINE 或 LIFF 字樣，視為 LINE 內建瀏覽器
} // 函式結束

function buildNoticeStorageKey(pathname: string, noticeType: string, displayName: string): string { // 建立 sessionStorage 用的防重複 key
  return `managers_notice_handled:${pathname}:${noticeType}:${displayName}`; // 以頁面路徑、通知類型、名稱組成唯一 key
} // 函式結束

function removeLineResultQuery(pathname: string, searchParams: URLSearchParams): string { // 產生移除 line 回傳參數後的新網址
  const nextParams = new URLSearchParams(searchParams.toString()); // 先複製目前網址參數，避免直接修改原始物件
  nextParams.delete("lineSuccess"); // 刪除成功參數
  nextParams.delete("lineExists"); // 刪除已存在參數
  nextParams.delete("lineDisplayName"); // 刪除 LINE 名稱參數
  nextParams.delete("lineError"); // 刪除錯誤參數
  const nextQuery = nextParams.toString(); // 把刪除後的參數重新組成 query string
  return nextQuery ? `${pathname}?${nextQuery}` : pathname; // 若還有其他參數就保留，否則只回傳純路徑
} // 函式結束

export default function ManagersPageClient() { // 匯出 managers 頁的主元件
  const router = useRouter(); // 取得 Next.js router 物件
  const pathname = usePathname(); // 取得目前頁面路徑
  const searchParams = useSearchParams(); // 取得目前網址查詢參數

  const [members, setMembers] = useState<ManagerMember[]>([]); // 儲存協助人員名單
  const [isLoadingMembers, setIsLoadingMembers] = useState<boolean>(false); // 控制名單讀取中的狀態
  const [isStartingLine, setIsStartingLine] = useState<boolean>(false); // 控制 LINE 綁定啟動中的狀態
  const [isDeletingId, setIsDeletingId] = useState<string>(""); // 控制目前正在刪除哪一筆資料
  const [noticeType, setNoticeType] = useState<NoticeType>(null); // 控制提醒視窗類型
  const [noticeTitle, setNoticeTitle] = useState<string>("提醒"); // 控制提醒視窗標題
  const [noticeText, setNoticeText] = useState<string>(""); // 控制提醒視窗內容
  const [showNoticeDialog, setShowNoticeDialog] = useState<boolean>(false); // 控制提醒視窗是否顯示
  const [pageError, setPageError] = useState<string>(""); // 顯示頁面層級錯誤訊息
  const [pageInfo, setPageInfo] = useState<string>(""); // 顯示頁面層級資訊訊息

  const hasHandledLineResultRef = useRef<boolean>(false); // 用來保證本次進頁只處理一次 LINE 回傳參數
  const pendingNoticeStorageKeyRef = useRef<string>(""); // 暫存這次提醒對應的 sessionStorage key，按確定時才標記已處理
  const popupWindowRef = useRef<Window | null>(null); // 儲存桌機 popup 視窗參考，避免重複開啟

  const currentQueryString = useMemo(() => searchParams?.toString() || "", [searchParams]); // 將 searchParams 轉成穩定字串，方便依賴管理

  const fetchMembers = useCallback(async () => { // 定義讀取協助人員名單的方法
    setIsLoadingMembers(true); // 開始讀取時先打開 loading
    setPageError(""); // 每次重新讀取前先清掉舊錯誤
    setPageInfo(""); // 每次重新讀取前先清掉舊資訊

    try { // 進入例外處理區塊
      const response = await fetch(MANAGERS_LIST_API, { // 呼叫協助人員清單 API
        method: "GET", // 使用 GET 方式讀取資料
        cache: "no-store", // 禁止快取，避免拿到舊資料
        credentials: "same-origin", // 保留同站 cookie / session
      }); // 呼叫結束

      if (!response.ok) { // 若 HTTP 狀態不是成功
        const errorText = await response.text(); // 讀取伺服器回傳錯誤文字
        throw new Error(errorText || "讀取協助人員名單失敗"); // 丟出錯誤供 catch 處理
      } // 判斷結束

      const data = await response.json(); // 將 API 回應轉成 JSON 物件

      const rawMembers = Array.isArray(data) // 若 API 直接回傳陣列
        ? data // 直接採用該陣列
        : Array.isArray(data?.members) // 若 API 回傳 { members: [] }
          ? data.members // 取出 members 陣列
          : []; // 其餘情況一律視為空陣列

      const normalizedMembers: ManagerMember[] = rawMembers.map((item: any) => ({ // 將 API 資料轉成頁面統一格式
        id: String(item?.id ?? item?.docId ?? item?.memberId ?? ""), // 優先找常見 ID 欄位
        role: item?.role ?? "", // 角色欄位
        name: item?.name ?? item?.displayName ?? item?.lineDisplayName ?? "", // 顯示名稱欄位
        email: item?.email ?? "", // 電子郵件欄位
        lineUserId: item?.lineUserId ?? "", // LINE userId 欄位
        lineDisplayName: item?.lineDisplayName ?? "", // LINE 顯示名稱欄位
        linePictureUrl: item?.linePictureUrl ?? "", // LINE 頭像網址欄位
        createdAt: item?.createdAt ?? item?.createdAtText ?? "", // 建立時間欄位
      })); // 轉換結束

      setMembers(normalizedMembers); // 將整理好的名單存入 state
    } catch (error: any) { // 捕捉例外錯誤
      setMembers([]); // 發生錯誤時先清空名單
      setPageError(error?.message || "讀取協助人員名單時發生錯誤"); // 顯示錯誤訊息
    } finally { // 不論成功失敗都執行
      setIsLoadingMembers(false); // 關閉 loading 狀態
    } // finally 結束
  }, []); // useCallback 依賴結束

  const cleanLineResultFromUrl = useCallback(() => { // 定義清除網址中 LINE 回傳參數的方法
    if (typeof window === "undefined") return; // 若不在瀏覽器環境則不處理
    const currentParams = new URLSearchParams(window.location.search); // 讀取目前網址 query 參數
    const cleanUrl = removeLineResultQuery(pathname || "/managers", currentParams); // 產生清除後的新網址
    window.history.replaceState({}, "", cleanUrl); // 使用 replaceState 取代當前網址，避免新增瀏覽歷史記錄
  }, [pathname]); // 依賴目前路徑

  const openNoticeDialog = useCallback((type: NoticeType, title: string, text: string, storageKey: string) => { // 定義開啟提醒視窗的方法
    setNoticeType(type); // 設定提醒種類
    setNoticeTitle(title); // 設定提醒標題
    setNoticeText(text); // 設定提醒內容
    pendingNoticeStorageKeyRef.current = storageKey; // 記住這次提醒對應的處理 key
    setShowNoticeDialog(true); // 顯示提醒視窗
  }, []); // useCallback 依賴結束

  const handleNoticeConfirm = useCallback(() => { // 定義按下提醒視窗「確定」按鈕時的處理
    if (typeof window !== "undefined" && pendingNoticeStorageKeyRef.current) { // 若在瀏覽器且有待寫入的 key
      window.sessionStorage.setItem(pendingNoticeStorageKeyRef.current, "1"); // 將這次提醒標記為本次工作階段已處理
    } // 判斷結束

    setShowNoticeDialog(false); // 關閉提醒視窗
    setNoticeType(null); // 清除提醒種類
    setNoticeTitle("提醒"); // 還原提醒標題
    setNoticeText(""); // 清空提醒內容
    pendingNoticeStorageKeyRef.current = ""; // 清空暫存 key
    cleanLineResultFromUrl(); // 把網址上的 LINE 結果參數真正清掉
  }, [cleanLineResultFromUrl]); // 依賴清網址方法

  const startLineBind = useCallback(async () => { // 定義啟動 LINE 綁定的方法
    setIsStartingLine(true); // 先打開按鈕 loading 狀態
    setPageError(""); // 清除舊錯誤
    setPageInfo(""); // 清除舊資訊

    try { // 進入例外處理區塊
      const shouldUseSameTab = isMobileDevice() || isLineInAppBrowser(); // 手機或 LINE 內建瀏覽器一律同頁跳轉
      const flow = "manager_bind"; // 固定傳入 manager 綁定流程代號
      const url = `${LINE_START_API}?flow=${encodeURIComponent(flow)}&preferSameTab=${shouldUseSameTab ? "1" : "0"}`; // 組出 LINE start API 呼叫網址

      const response = await fetch(url, { // 呼叫 start API
        method: "GET", // 使用 GET 方式
        cache: "no-store", // 禁止快取避免舊網址殘留
        credentials: "same-origin", // 保留同站 cookie / session
      }); // 呼叫結束

      if (!response.ok) { // 若 start API 回傳不是成功
        const errorText = await response.text(); // 讀取伺服器錯誤訊息
        throw new Error(errorText || "啟動 LINE 綁定失敗"); // 丟出錯誤
      } // 判斷結束

      const data = await response.json(); // 將 API 回傳轉成 JSON

      const loginUrl = String(data?.loginUrl || ""); // 取出 LINE 授權登入網址
      const mode = String(data?.mode || "normal"); // 取出這次模式 normal / qr
      const preferSameTab = Boolean(data?.preferSameTab ?? shouldUseSameTab); // 取出伺服器判定是否同頁

      if (!loginUrl) { // 若 API 沒有回登入網址
        throw new Error("LINE 綁定網址不存在"); // 直接視為錯誤
      } // 判斷結束

      if (preferSameTab) { // 若應使用同頁跳轉
        window.location.href = loginUrl; // 直接同頁導向 LINE 授權頁，避免 LINE 內建瀏覽器多開視窗
        return; // 同頁跳走後直接結束
      } // 同頁分支結束

      if (mode === "qr") { // 若桌機由後端指定使用 qr 模式
        const popupWidth = 520; // 設定 popup 寬度
        const popupHeight = 760; // 設定 popup 高度
        const popupLeft = Math.max(window.screenX + (window.outerWidth - popupWidth) / 2, 0); // 計算 popup 左側位置
        const popupTop = Math.max(window.screenY + (window.outerHeight - popupHeight) / 2, 0); // 計算 popup 上側位置
        const popupFeatures = `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},resizable=yes,scrollbars=yes`; // 組出 popup 視窗設定字串

        if (popupWindowRef.current && !popupWindowRef.current.closed) { // 若舊 popup 仍存在且未關閉
          popupWindowRef.current.location.href = loginUrl; // 直接把舊 popup 導到新的登入網址
          popupWindowRef.current.focus(); // 聚焦該 popup
        } else { // 若目前沒有可重用的 popup
          popupWindowRef.current = window.open(loginUrl, "lineLoginPopup", popupFeatures); // 開啟新的 popup 視窗
        } // popup 分支結束

        if (!popupWindowRef.current) { // 若瀏覽器阻擋 popup 導致開不起來
          window.location.href = loginUrl; // 退回用同頁跳轉，避免使用者卡住
          return; // 導頁後直接結束
        } // 判斷結束
      } else { // 其餘桌機 normal 模式
        window.location.href = loginUrl; // 直接同頁跳轉，流程更簡單穩定
        return; // 導頁後直接結束
      } // mode 分支結束
    } catch (error: any) { // 捕捉啟動 LINE 綁定時的錯誤
      setPageError(error?.message || "LINE 綁定啟動失敗"); // 顯示錯誤訊息
    } finally { // 不論成功失敗都執行
      setIsStartingLine(false); // 關閉按鈕 loading
    } // finally 結束
  }, []); // useCallback 依賴結束

  const handleDeleteMember = useCallback(async (member: ManagerMember) => { // 定義刪除協助人員的方法
    if (!member?.id) return; // 若沒有有效 ID 就不處理

    const roleText = String(member?.role || "").toLowerCase(); // 先取出角色文字並轉小寫方便比對

    if (roleText === "owner") return; // owner 不可刪除，直接中止

    const confirmText = `確定要刪除「${member?.name || member?.lineDisplayName || "這位協助人員"}」嗎？`; // 組出刪除前確認文字

    const ok = window.confirm(confirmText); // 跳出原生確認視窗，避免誤刪
    if (!ok) return; // 若使用者取消就不做任何事

    setIsDeletingId(member.id); // 記錄目前正在刪除哪一筆
    setPageError(""); // 清除舊錯誤
    setPageInfo(""); // 清除舊資訊

    try { // 進入例外處理區塊
      const response = await fetch(MANAGERS_DELETE_API, { // 呼叫刪除 API
        method: "POST", // 使用 POST 方式刪除
        headers: { "Content-Type": "application/json" }, // 宣告 JSON 格式
        credentials: "same-origin", // 保留同站 cookie / session
        body: JSON.stringify({ id: member.id }), // 將要刪除的成員 ID 傳給後端
      }); // 呼叫結束

      if (!response.ok) { // 若刪除 API 回傳非成功
        const errorText = await response.text(); // 讀取伺服器錯誤文字
        throw new Error(errorText || "刪除協助人員失敗"); // 丟出錯誤
      } // 判斷結束

      setPageInfo("已刪除協助人員"); // 顯示刪除成功資訊
      await fetchMembers(); // 刪除成功後重新讀取名單
    } catch (error: any) { // 捕捉刪除時的錯誤
      setPageError(error?.message || "刪除協助人員時發生錯誤"); // 顯示錯誤訊息
    } finally { // 不論成功失敗都執行
      setIsDeletingId(""); // 清掉刪除中的 ID
    } // finally 結束
  }, [fetchMembers]); // 依賴名單重抓方法

  useEffect(() => { // 頁面初次載入時先抓一次名單
    fetchMembers(); // 執行名單讀取
  }, [fetchMembers]); // 依賴名單讀取函式

  useEffect(() => { // 處理 LINE 登入回來後的 query 參數，並保證只處理一次
    if (typeof window === "undefined") return; // 若不在瀏覽器環境則不處理
    if (!searchParams) return; // 若 searchParams 尚未準備好則不處理
    if (hasHandledLineResultRef.current) return; // 若本輪已處理過就不再重複處理

    const lineSuccess = searchParams.get("lineSuccess") || ""; // 讀取成功參數
    const lineExists = searchParams.get("lineExists") || ""; // 讀取已存在參數
    const lineDisplayName = searchParams.get("lineDisplayName") || ""; // 讀取顯示名稱參數
    const lineError = searchParams.get("lineError") || ""; // 讀取錯誤參數

    if (!lineSuccess && !lineExists && !lineError) return; // 若沒有任何 LINE 回傳結果就不處理

    hasHandledLineResultRef.current = true; // 鎖住本輪只處理一次，避免 effect 重跑重複開 Dialog

    let nextNoticeType: NoticeType = null; // 宣告提醒類型變數
    let nextNoticeTitle = "提醒"; // 宣告提醒標題變數
    let nextNoticeText = ""; // 宣告提醒內容變數

    if (lineSuccess === "1") { // 若是 LINE 綁定成功
      nextNoticeType = "success"; // 設定提醒類型為成功
      nextNoticeTitle = "提醒"; // 設定標題
      nextNoticeText = lineDisplayName // 若有 LINE 名稱
        ? `LINE 帳號（${lineDisplayName}）已成功加入協助管理人員。` // 顯示含名稱的成功訊息
        : "LINE 帳號已成功加入協助管理人員。"; // 若無名稱則顯示一般成功訊息
    } else if (lineExists === "1") { // 若是 LINE 已存在
      nextNoticeType = "exists"; // 設定提醒類型為已存在
      nextNoticeTitle = "提醒"; // 設定標題
      nextNoticeText = lineDisplayName // 若有 LINE 名稱
        ? `這個 LINE 帳號（${lineDisplayName}）已經加入協助管理人員了。` // 顯示含名稱的已存在訊息
        : "這個 LINE 帳號已經加入協助管理人員了。"; // 若無名稱則顯示一般已存在訊息
    } else if (lineError) { // 若有錯誤參數
      nextNoticeType = "error"; // 設定提醒類型為錯誤
      nextNoticeTitle = "提醒"; // 設定標題
      nextNoticeText = decodeURIComponent(lineError); // 將錯誤訊息解碼後顯示
    } // 條件分支結束

    const storageKey = buildNoticeStorageKey(pathname || "/managers", nextNoticeType || "none", lineDisplayName || lineError || "empty"); // 建立本次提醒的防重複 key
    const alreadyHandled = window.sessionStorage.getItem(storageKey) === "1"; // 檢查本次提醒是否在本工作階段已處理過

    if (alreadyHandled) { // 若本工作階段已處理過這次提醒
      cleanLineResultFromUrl(); // 直接把網址 query 清掉
      fetchMembers(); // 仍然順手重新讀取名單，確保資料是最新的
      return; // 結束本次處理，不再顯示 Dialog
    } // 判斷結束

    openNoticeDialog(nextNoticeType, nextNoticeTitle, nextNoticeText, storageKey); // 開啟提醒視窗
    fetchMembers(); // 顯示提醒時同步重抓名單，讓頁面資料立即更新
  }, [searchParams, pathname, currentQueryString, cleanLineResultFromUrl, openNoticeDialog, fetchMembers]); // 依賴項目結束

  return ( // 回傳整個頁面 JSX
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6"> {/* 整體頁面容器，控制最大寬度與內距 */}
      <div className="mb-6 flex items-center justify-between gap-3"> {/* 頁首工具列容器 */}
        <div> {/* 左側標題區塊 */}
          <div className="text-sm text-blue-700">Performance 後台</div> {/* 小標題 */}
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">協助人員管理</h1> {/* 主標題 */}
          <p className="mt-3 text-base leading-7 text-slate-600">這裡先測試讀取與 LINE 綁定 Investors3 / members 協助人員資料。</p> {/* 說明文字 */}
        </div> {/* 左側標題區塊結束 */}

        <button
          type="button" // 設定按鈕型態為一般按鈕
          onClick={() => router.push("/dashboard")} // 點擊後返回首頁 /dashboard
          className="rounded-3xl border-4 border-slate-400 bg-white px-6 py-4 text-2xl font-extrabold text-slate-900 shadow-sm transition hover:bg-slate-50" // 設定按鈕樣式
        >
          返回首頁 {/* 按鈕文字 */}
        </button> {/* 返回首頁按鈕結束 */}
      </div> {/* 頁首工具列結束 */}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3"> {/* 三顆主要操作按鈕的格線容器 */}
        <button
          type="button" // 設定按鈕型態
          onClick={startLineBind} // 點擊後啟動 LINE 綁定流程
          disabled={isStartingLine} // 啟動中時禁用按鈕，避免連點
          className="rounded-2xl bg-green-600 px-5 py-4 text-lg font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60" // 設定按鈕樣式
        >
          {isStartingLine ? "LINE 綁定啟動中..." : "前往 LINE 綁定頁"} {/* 根據狀態顯示不同按鈕文字 */}
        </button> {/* LINE 綁定按鈕結束 */}

        <button
          type="button" // 設定按鈕型態
          onClick={() => router.push(MANAGER_LOGIN_PATH)} // 點擊後前往帳號密碼登入頁
          className="rounded-2xl border-2 border-slate-400 bg-white px-5 py-4 text-lg font-bold text-slate-700 shadow-sm transition hover:bg-slate-50" // 設定按鈕樣式
        >
          帳號 / 密碼登入 {/* 按鈕文字 */}
        </button> {/* 帳密登入按鈕結束 */}

        <button
          type="button" // 設定按鈕型態
          onClick={fetchMembers} // 點擊後重新讀取協助人員名單
          disabled={isLoadingMembers} // 讀取中時禁用按鈕
          className="rounded-2xl border-2 border-blue-500 bg-white px-5 py-4 text-lg font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60" // 設定按鈕樣式
        >
          {isLoadingMembers ? "讀取中..." : "重新讀取名單"} {/* 根據讀取狀態顯示按鈕文字 */}
        </button> {/* 重新讀取按鈕結束 */}
      </div> {/* 三顆操作按鈕結束 */}

      {pageError ? ( // 若目前有錯誤訊息
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"> {/* 錯誤提示框 */}
          {pageError} {/* 顯示錯誤文字 */}
        </div> // 錯誤提示框結束
      ) : null} {/* 沒有錯誤時不顯示 */}

      {pageInfo ? ( // 若目前有一般資訊訊息
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"> {/* 資訊提示框 */}
          {pageInfo} {/* 顯示資訊文字 */}
        </div> // 資訊提示框結束
      ) : null} {/* 沒有資訊時不顯示 */}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"> {/* 名單區塊外框 */}
        <div className="border-b border-slate-200 px-5 py-4"> {/* 名單標題列 */}
          <h2 className="text-xl font-extrabold text-slate-900">協助人員名單</h2> {/* 名單主標題 */}
          <p className="mt-1 text-sm text-slate-500">目前共 {members.length} 筆資料</p> {/* 顯示目前資料總筆數 */}
        </div> {/* 名單標題列結束 */}

        {isLoadingMembers ? ( // 若正在讀取名單
          <div className="px-5 py-8 text-base text-slate-500">名單讀取中...</div> // 顯示讀取中文字
        ) : members.length === 0 ? ( // 若沒有任何資料
          <div className="px-5 py-8 text-base text-slate-500">目前沒有協助人員資料。</div> // 顯示空資料訊息
        ) : ( // 若有資料
          <div className="divide-y divide-slate-200"> {/* 名單內容容器，項目之間用分隔線 */}
            {members.map((member) => { // 逐筆渲染協助人員資料
              const displayName = member.name || member.lineDisplayName || "未命名"; // 先決定此筆資料主要顯示名稱
              const isOwner = String(member.role || "").toLowerCase() === "owner"; // 判斷這筆是否為 owner
              const pictureUrl = member.linePictureUrl || ""; // 取得頭像網址

              return ( // 回傳單筆項目的 JSX
                <div key={member.id} className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between"> {/* 單筆資料外框 */}
                  <div className="flex min-w-0 items-center gap-4"> {/* 左側頭像與文字資訊區 */}
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100"> {/* 頭像圓形容器 */}
                      {pictureUrl ? ( // 若有頭像網址
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pictureUrl} alt={displayName} className="h-full w-full object-cover" /> // 顯示頭像圖片
                      ) : ( // 若沒有頭像網址
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-400">無圖</div> // 顯示無圖佔位文字
                      )} {/* 頭像條件結束 */}
                    </div> {/* 頭像容器結束 */}

                    <div className="min-w-0"> {/* 右側文字資訊容器 */}
                      <div className="flex flex-wrap items-center gap-2"> {/* 名稱與角色標籤列 */}
                        <div className="truncate text-lg font-extrabold text-slate-900">{displayName}</div> {/* 顯示名稱 */}
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isOwner ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}> {/* 角色標籤 */}
                          {isOwner ? "owner" : member.role || "manager"} {/* 顯示角色文字 */}
                        </span> {/* 角色標籤結束 */}
                      </div> {/* 名稱與角色列結束 */}

                      <div className="mt-2 space-y-1 text-sm text-slate-500"> {/* 細節文字區 */}
                        {member.email ? <div>信箱：{member.email}</div> : null} {/* 若有 email 就顯示 */}
                        {member.lineUserId ? <div className="break-all">LINE ID：{member.lineUserId}</div> : null} {/* 若有 LINE ID 就顯示 */}
                        {member.createdAt ? <div>建立時間：{member.createdAt}</div> : null} {/* 若有建立時間就顯示 */}
                      </div> {/* 細節文字區結束 */}
                    </div> {/* 右側文字資訊容器結束 */}
                  </div> {/* 左側資訊區結束 */}

                  <div className="flex items-center gap-3"> {/* 右側操作按鈕區 */}
                    <button
                      type="button" // 設定按鈕型態
                      onClick={() => handleDeleteMember(member)} // 點擊時刪除該協助人員
                      disabled={isOwner || isDeletingId === member.id} // owner 不可刪除，或該筆刪除中時禁用
                      className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-sm transition ${isOwner ? "cursor-not-allowed bg-slate-200 text-slate-400" : "bg-red-600 text-white hover:bg-red-700"} ${isDeletingId === member.id ? "opacity-60" : ""}`} // 根據狀態切換樣式
                    >
                      {isOwner ? "owner 不可刪除" : isDeletingId === member.id ? "刪除中..." : "刪除"} {/* 按鈕文字依狀態切換 */}
                    </button> {/* 刪除按鈕結束 */}
                  </div> {/* 右側操作按鈕區結束 */}
                </div> // 單筆資料外框結束
              ); // return 結束
            })} {/* members map 結束 */}
          </div> // 名單內容容器結束
        )} {/* 名單區塊條件渲染結束 */}
      </div> {/* 名單主卡片結束 */}

      {showNoticeDialog ? ( // 若 showNoticeDialog 為 true，顯示自訂提醒 Dialog
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4"> {/* 全螢幕遮罩層 */}
          <div className="w-full max-w-2xl rounded-[32px] bg-white px-7 py-7 shadow-2xl"> {/* Dialog 白底主容器 */}
            <div className="text-4xl font-extrabold text-slate-900">{noticeTitle}</div> {/* Dialog 標題 */}
            <div className="mt-8 whitespace-pre-wrap text-2xl leading-[1.9] text-slate-600">{noticeText}</div> {/* Dialog 內容文字 */}
            <div className="mt-10 flex justify-end"> {/* Dialog 按鈕列 */}
              <button
                type="button" // 設定按鈕型態
                onClick={handleNoticeConfirm} // 點擊後執行確認處理
                className="rounded-[24px] bg-amber-400 px-8 py-5 text-2xl font-bold text-white shadow-sm transition hover:bg-amber-500" // 設定按鈕樣式
              >
                確定 {/* 按鈕文字 */}
              </button> {/* 確定按鈕結束 */}
            </div> {/* Dialog 按鈕列結束 */}
          </div> {/* Dialog 白底主容器結束 */}
        </div> // 全螢幕遮罩層結束
      ) : null} {/* 不顯示時回傳 null */}
    </div> // 整體頁面容器結束
  ); // JSX 回傳結束
} // 主元件結束