"use client"; // 這個頁面在瀏覽器端執行，因為要使用 hook、前端 fetch 與查詢參數功能

import Link from "next/link"; // 匯入 Next.js 的 Link 元件
import { useCallback, useEffect, useMemo, useRef, useState } from "react"; // 匯入 React hook
import { useSearchParams } from "next/navigation"; // 匯入網址查詢參數 hook
import { collection, deleteDoc, doc, getDocs } from "firebase/firestore"; // 匯入 Firestore 讀取與刪除方法
import { db } from "../../lib/firebase"; // 匯入前端 Firestore 實例

type ManagerItem = { // 定義協助人員資料型別
  id: string; // Firestore 文件 ID
  name: string; // 姓名
  role: string; // 角色
  linePictureUrl: string; // LINE 頭像網址
}; // 型別定義結束

const VENDOR_ID = "vendor-yogo-001"; // 目前測試用的廠商文件 ID
const LINE_LOGIN_WINDOW_NAME = "manager_line_login_window"; // 固定的 LINE 登入視窗名稱
const PASSWORD_LOGIN_WINDOW_NAME = "manager_password_login_window"; // 固定的帳密登入視窗名稱

export default function ManagersPageClient() { // 協助人員管理頁元件開始
  const [items, setItems] = useState<ManagerItem[]>([]); // 儲存協助人員列表
  const [loading, setLoading] = useState(true); // 控制讀取中狀態
  const [error, setError] = useState(""); // 儲存讀取錯誤訊息
  const [deletingId, setDeletingId] = useState(""); // 記錄目前正在刪除的文件 ID
  const [lineLoading, setLineLoading] = useState<"" | "normal" | "qr">(""); // 控制 LINE 啟動中狀態
  const [debugLogs, setDebugLogs] = useState<string[]>([]); // 儲存畫面上的 debug 訊息
  const [loadManagersCount, setLoadManagersCount] = useState(0); // 記錄 loadManagers 呼叫次數
  const [didHydrate, setDidHydrate] = useState(false); // 記錄是否完成前端掛載
  const [lastPopupState, setLastPopupState] = useState("未開啟"); // 顯示最近一次視窗狀態
  const [relayClosing, setRelayClosing] = useState(false); // 若目前頁是登入子視窗回來的 relay 頁，顯示處理中畫面
  const [noticeType, setNoticeType] = useState<"" | "success" | "warning" | "error">(""); // 控制頁面提示類型
  const [noticeText, setNoticeText] = useState(""); // 控制頁面提示文字
  const [showDebugPanel, setShowDebugPanel] = useState(false); // 控制除錯區塊是否展開，預設先關閉
  const [showNoticeDialog, setShowNoticeDialog] = useState(false); // 控制中間提示視窗是否顯示

  const loadTimeoutRef = useRef<number | null>(null); // 記錄讀取逾時 timer
  const popupRef = useRef<Window | null>(null); // 記錄目前開啟的外部分頁視窗參考
  const popupMonitorTimerRef = useRef<number | null>(null); // 記錄監看 popup 是否關閉的 timer
  const lastReloadAtRef = useRef(0); // 記錄上次 reload 時間，避免短時間重複 reload
  const cleanupQueryTimerRef = useRef<number | null>(null); // 記錄清除網址參數 timer

  const searchParams = useSearchParams(); // 取得目前網址查詢參數
  const lineSuccess = useMemo(() => searchParams.get("lineSuccess"), [searchParams]); // 取得 lineSuccess 參數
  const lineError = useMemo(() => searchParams.get("lineError"), [searchParams]); // 取得 lineError 參數
  const lineExists = useMemo(() => searchParams.get("lineExists"), [searchParams]); // 取得 lineExists 參數
  const lineDisplayName = useMemo(() => searchParams.get("lineDisplayName"), [searchParams]); // 取得 lineDisplayName 參數
  const systemLineLogin = useMemo(() => searchParams.get("systemLineLogin"), [searchParams]); // 取得 systemLineLogin 參數
  const popupLoginDone = useMemo(() => searchParams.get("popupLoginDone"), [searchParams]); // 取得 popupLoginDone 參數

  const appendDebugLog = useCallback((message: string) => { // 建立畫面與 console 共用的 debug 紀錄函式
    const now = new Date(); // 取得現在時間
    const timeText = now.toLocaleTimeString("zh-TW", { hour12: false }); // 轉成 24 小時制文字
    const logText = `[${timeText}] ${message}`; // 組合單筆 log

    console.log("[ManagersPage]", logText); // 同步輸出到 console

    setDebugLogs((prev) => { // 更新畫面上的 debug 陣列
      const next = [...prev, logText]; // 加入新訊息
      return next.slice(-40); // 只保留最後 40 筆，避免畫面過長
    }); // setDebugLogs 結束
  }, []); // useCallback 結束

  const clearLoadTimeout = useCallback(() => { // 建立清除讀取逾時 timer 函式
    if (loadTimeoutRef.current !== null) { // 若目前有 timer
      window.clearTimeout(loadTimeoutRef.current); // 清除 timer
      loadTimeoutRef.current = null; // 重設 ref
    } // 判斷結束
  }, []); // useCallback 結束

  const clearPopupMonitor = useCallback(() => { // 建立清除 popup 監看 timer 函式
    if (popupMonitorTimerRef.current !== null) { // 若目前有監看 timer
      window.clearInterval(popupMonitorTimerRef.current); // 清除監看 timer
      popupMonitorTimerRef.current = null; // 重設 ref
    } // 判斷結束
  }, []); // useCallback 結束

  const clearCleanupQueryTimer = useCallback(() => { // 建立清除網址清理 timer 函式
    if (cleanupQueryTimerRef.current !== null) { // 若網址清理 timer 存在
      window.clearTimeout(cleanupQueryTimerRef.current); // 清除網址清理 timer
      cleanupQueryTimerRef.current = null; // 重設 ref
    } // 判斷結束
  }, []); // useCallback 結束

  const closeNoticeDialog = useCallback(() => { // 建立手動關閉中間提示視窗函式
    setShowNoticeDialog(false); // 關閉中間提示視窗
    setNoticeType(""); // 清空提示類型
    setNoticeText(""); // 清空提示文字
    appendDebugLog("提示訊息已手動關閉"); // 紀錄 debug 訊息
  }, [appendDebugLog]); // useCallback 結束

  const resetTransientState = useCallback(() => { // 建立統一重置頁面暫存狀態函式
    setLineLoading(""); // 清空 LINE 啟動中狀態
    setDeletingId(""); // 清空刪除中狀態
    appendDebugLog("resetTransientState() 已執行，已清空 lineLoading / deletingId"); // 紀錄 debug
  }, [appendDebugLog]); // useCallback 結束

  const loadManagers = useCallback(async (source: string = "unknown") => { // 宣告讀取 members 子集合資料函式
    try { // 開始錯誤捕捉
      appendDebugLog(`loadManagers() 開始，來源=${source}`); // 紀錄開始讀取
      setLoadManagersCount((prev) => prev + 1); // 累加讀取次數
      setLoading(true); // 開始讀取前設為讀取中
      setError(""); // 清空舊錯誤訊息

      clearLoadTimeout(); // 先清掉舊的 timer

      loadTimeoutRef.current = window.setTimeout(() => { // 建立 8 秒逾時提示
        appendDebugLog("loadManagers() 超過 8 秒仍未完成，先顯示錯誤提示"); // 紀錄逾時
        setError("協助人員資料讀取逾時，請點下方『重新讀取名單』再試一次。"); // 顯示錯誤
        setLoading(false); // 不要一直卡在讀取中
      }, 8000); // 8 秒後執行

      const membersRef = collection( // 建立 members 子集合路徑
        db, // 使用 Firestore 實例
        "Investors3", // 第一層集合
        VENDOR_ID, // 廠商文件 ID
        "members" // 子集合名稱
      ); // 路徑建立完成

      appendDebugLog(`Firestore 路徑：Investors3 / ${VENDOR_ID} / members`); // 紀錄路徑

      const snapshot = await getDocs(membersRef); // 讀取 members 子集合所有文件
      appendDebugLog(`getDocs 成功，文件數量=${snapshot.size}`); // 紀錄讀取成功

      const list: ManagerItem[] = snapshot.docs.map((itemDoc) => { // 將每筆文件轉成前端格式
        const data = itemDoc.data(); // 取得文件資料

        return { // 回傳整理後的物件
          id: itemDoc.id, // 文件 ID
          name: (data.name as string) ?? "", // 姓名
          role: (data.role as string) ?? "", // 角色
          linePictureUrl: (data.linePictureUrl as string) ?? "", // LINE 頭像網址
        }; // 單筆資料整理完成
      }); // map 結束

      list.sort((a, b) => a.id.localeCompare(b.id)); // 依文件 ID 排序
      setItems(list); // 存入列表狀態
      appendDebugLog(`列表整理完成，setItems(${list.length}) 已執行`); // 紀錄 setItems
    } catch (err) { // 若讀取失敗則進入這裡
      console.error("讀取協助人員資料失敗:", err); // 印出詳細錯誤
      appendDebugLog(`loadManagers() 失敗：${err instanceof Error ? err.message : String(err)}`); // 顯示錯誤內容
      setError(`讀取協助人員資料失敗：${err instanceof Error ? err.message : String(err)}`); // 顯示完整錯誤
    } finally { // 不論成功失敗最後都執行
      clearLoadTimeout(); // 清除逾時 timer
      setLoading(false); // 結束讀取狀態
      appendDebugLog("loadManagers() 結束，setLoading(false) 已執行"); // 紀錄 finally
    } // finally 結束
  }, [appendDebugLog, clearLoadTimeout]); // useCallback 結束

  const reloadManagersSafely = useCallback((source: string) => { // 建立防抖 reload 函式
    const now = Date.now(); // 取得目前時間
    const diff = now - lastReloadAtRef.current; // 計算距離上次 reload 的時間差

    if (diff < 800) { // 若 800ms 內重複觸發
      appendDebugLog(`reloadManagersSafely() 略過，來源=${source}，距離上次僅 ${diff}ms`); // 紀錄略過
      return; // 中止重複 reload
    } // 判斷結束

    lastReloadAtRef.current = now; // 記錄本次 reload 時間
    loadManagers(source); // 執行真正 reload
  }, [appendDebugLog, loadManagers]); // useCallback 結束

  useEffect(() => { // 標記已完成 hydration
    setDidHydrate(true); // 標記前端掛載完成
    appendDebugLog("didHydrate=true"); // 紀錄 hydration
  }, [appendDebugLog]); // 只執行一次

  useEffect(() => { // 若目前這一頁是登入子視窗回來的結果頁，直接把結果丟回主頁並關閉自己
    const hasPopupResult = Boolean(lineSuccess || lineExists || lineError || systemLineLogin || popupLoginDone === "1"); // 判斷是否帶有登入結果參數
    const hasOpener = typeof window !== "undefined" && !!window.opener && !window.opener.closed; // 判斷是否有主頁 opener

    if (!hasPopupResult || !hasOpener) { // 若不是結果頁或沒有 opener
      return; // 中止 relay 流程
    } // 判斷結束

    setRelayClosing(true); // 顯示處理中畫面
    appendDebugLog("偵測到此頁為登入子視窗結果頁，準備把結果導回主頁並自動關閉"); // 紀錄 relay 流程

    try { // 開始處理 opener 導頁
      const openerUrl = new URL("/managers", window.location.origin); // 建立主頁 managers URL

      if (lineSuccess) openerUrl.searchParams.set("lineSuccess", lineSuccess); // 帶回 lineSuccess
      if (lineExists) openerUrl.searchParams.set("lineExists", lineExists); // 帶回 lineExists
      if (lineDisplayName) openerUrl.searchParams.set("lineDisplayName", lineDisplayName); // 帶回 lineDisplayName
      if (lineError) openerUrl.searchParams.set("lineError", lineError); // 帶回 lineError
      if (systemLineLogin) openerUrl.searchParams.set("systemLineLogin", systemLineLogin); // 帶回 systemLineLogin
      if (popupLoginDone === "1") openerUrl.searchParams.set("popupLoginDone", "1"); // 帶回 popupLoginDone

      openerUrl.searchParams.set("t", String(Date.now())); // 加時間戳，確保主頁重新整理 query

      window.opener.location.replace(openerUrl.toString()); // 直接把主頁導到正確結果頁
      window.close(); // 關閉自己
    } catch (err) { // 若 relay 失敗
      console.error("relay opener error:", err); // 印出錯誤
      appendDebugLog(`relay opener 失敗：${err instanceof Error ? err.message : String(err)}`); // 紀錄錯誤
      setRelayClosing(false); // 還原畫面
    } // 錯誤處理結束
  }, [lineSuccess, lineExists, lineDisplayName, lineError, systemLineLogin, popupLoginDone, appendDebugLog]); // 依賴登入結果參數

  useEffect(() => { // 頁面第一次載入時執行
    appendDebugLog("頁面初始化"); // 紀錄初始化
    loadManagers("initial_mount"); // 讀取協助人員列表
  }, [appendDebugLog, loadManagers]); // 依賴項目

  useEffect(() => { // 依 query 參數顯示提示，並自動清掉網址，但不自動關閉 dialog
    clearCleanupQueryTimer(); // 先清掉舊 timer

    const hasQueryNotice = Boolean(lineSuccess || lineError || lineExists || systemLineLogin || popupLoginDone); // 判斷是否有提示參數

    appendDebugLog(`query 參數變化：lineSuccess=${lineSuccess ?? ""}，lineError=${lineError ?? ""}，lineExists=${lineExists ?? ""}，systemLineLogin=${systemLineLogin ?? ""}，popupLoginDone=${popupLoginDone ?? ""}`); // 紀錄 query 變化
    resetTransientState(); // 清空暫存狀態

    if (!hasQueryNotice) { // 若目前沒有任何提示參數
      return () => { // effect 清理時執行
        clearCleanupQueryTimer(); // 清除 timer
      }; // 清理結束
    } // 判斷結束

    let nextNoticeType: "" | "success" | "warning" | "error" = ""; // 記錄提示類型
    let nextNoticeText = ""; // 記錄提示文字

    if (lineSuccess === "1") { // 若 LINE 綁定成功
      nextNoticeType = "success"; // 設定成功提示
      nextNoticeText = "LINE 綁定成功，資料已回填到協助人員清單。"; // 設定提示文字
    } else if (systemLineLogin === "1") { // 若系統 LINE 登入成功
      nextNoticeType = "success"; // 設定成功提示
      nextNoticeText = "LINE 登入成功，已返回主頁。"; // 設定提示文字
    } else if (popupLoginDone === "1") { // 若帳號 / 密碼登入成功
      nextNoticeType = "success"; // 設定成功提示
      nextNoticeText = "帳號 / 密碼登入成功，已返回主頁。"; // 設定提示文字
    } else if (lineExists === "1") { // 若同一個 LINE 已存在
      nextNoticeType = "warning"; // 設定警告提示
      nextNoticeText = `這個 LINE 帳號${lineDisplayName ? `（${lineDisplayName}）` : ""}已經加入協助管理人員了。`; // 設定提示文字
    } else if (lineError) { // 若有 LINE 錯誤
      nextNoticeType = "error"; // 設定錯誤提示
      nextNoticeText = `LINE 綁定失敗：${lineError}`; // 設定提示文字
    } // 判斷結束

    setNoticeType(nextNoticeType); // 更新提示類型
    setNoticeText(nextNoticeText); // 更新提示文字
    setShowNoticeDialog(Boolean(nextNoticeType && nextNoticeText)); // 顯示中間提示視窗

    cleanupQueryTimerRef.current = window.setTimeout(() => { // 延遲後清掉網址參數
      const cleanUrl = `${window.location.origin}/managers`; // 建立乾淨網址
      window.history.replaceState({}, "", cleanUrl); // 不重整頁面，直接把網址改回 /managers
      appendDebugLog("已自動清除網址提示參數，網址回復為 /managers"); // 紀錄網址清理
    }, 600); // 延遲執行

    return () => { // effect 清理時執行
      clearCleanupQueryTimer(); // 清除 timer
    }; // 清理結束
  }, [appendDebugLog, clearCleanupQueryTimer, lineDisplayName, lineError, lineExists, lineSuccess, popupLoginDone, resetTransientState, systemLineLogin]); // 依賴項目

  useEffect(() => { // 監聽視窗重新取得焦點與可見性變化
    const handleFocus = () => { // 建立 focus 事件處理函式
      appendDebugLog("window focus 觸發"); // 紀錄 focus
      resetTransientState(); // 清空暫存狀態
      reloadManagersSafely("window_focus_reload"); // 只在 focus 時重新讀資料
    }; // handleFocus 結束

    const handleVisibilityChange = () => { // 建立 visibilitychange 事件處理函式
      appendDebugLog(`visibilitychange 觸發，state=${document.visibilityState}`); // 紀錄事件
      if (document.visibilityState === "visible") { // 若頁面重新可見
        resetTransientState(); // 只清空暫存狀態，不直接 reload，避免跟 focus 重複
      } // 判斷結束
    }; // handleVisibilityChange 結束

    window.addEventListener("focus", handleFocus); // 監聽 focus
    document.addEventListener("visibilitychange", handleVisibilityChange); // 監聽可見性變更

    return () => { // 元件卸載時清理監聽
      window.removeEventListener("focus", handleFocus); // 移除 focus
      document.removeEventListener("visibilitychange", handleVisibilityChange); // 移除 visibilitychange
    }; // 清理結束
  }, [appendDebugLog, reloadManagersSafely, resetTransientState]); // 依賴項目

  useEffect(() => { // 元件卸載時清理 timer
    return () => { // 清理開始
      clearLoadTimeout(); // 清除讀取逾時 timer
      clearPopupMonitor(); // 清除 popup 監看 timer
      clearCleanupQueryTimer(); // 清除網址清理 timer
    }; // 清理結束
  }, [clearLoadTimeout, clearPopupMonitor, clearCleanupQueryTimer]); // 依賴項目

  const handleDelete = async (id: string, role: string) => { // 建立刪除協助人員函式
    appendDebugLog(`handleDelete() 被點擊，id=${id}，role=${role}`); // 紀錄刪除點擊

    if (role === "owner") { // 若是 owner
      alert("owner 主管理者不可刪除。"); // 顯示提醒視窗
      appendDebugLog("handleDelete() 中止，owner 不可刪除"); // 紀錄中止原因
      return; // 中止刪除流程
    } // owner 檢查結束

    const ok = window.confirm(`確定要刪除這位協助人員嗎？\n文件ID：${id}`); // 跳出確認視窗
    if (!ok) { // 若使用者取消
      appendDebugLog("handleDelete() 使用者取消刪除"); // 紀錄取消
      return; // 中止
    } // 判斷結束

    try { // 開始刪除流程
      setDeletingId(id); // 記錄目前正在刪除的文件 ID
      appendDebugLog(`開始刪除文件：${id}`); // 紀錄開始刪除

      const memberRef = doc( // 建立要刪除的文件路徑
        db, // 使用 Firestore 實例
        "Investors3", // 第一層集合
        VENDOR_ID, // 廠商文件 ID
        "members", // 子集合名稱
        id // 文件 ID
      ); // 路徑建立完成

      await deleteDoc(memberRef); // 執行刪除文件
      appendDebugLog(`刪除成功：${id}`); // 紀錄刪除成功
      await loadManagers("delete_success_reload"); // 刪除成功後重新讀取列表
    } catch (err) { // 若刪除失敗
      console.error("刪除協助人員失敗:", err); // 印出詳細錯誤
      appendDebugLog(`刪除失敗：${err instanceof Error ? err.message : String(err)}`); // 顯示錯誤
      alert("刪除協助人員失敗"); // 顯示提醒視窗
    } finally { // 不論成功失敗最後都執行
      setDeletingId(""); // 清空刪除中的文件 ID
      appendDebugLog("handleDelete() finally 結束，deletingId 已清空"); // 紀錄 finally
    } // finally 結束
  }; // handleDelete 函式結束

  const isMobileDevice = () => { // 建立判斷是否為手機裝置的函式
    if (typeof window === "undefined") { // 若目前不是瀏覽器環境
      return false; // 回傳 false
    } // 判斷結束

    const userAgent = window.navigator.userAgent || ""; // 取得目前瀏覽器 userAgent
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent); // 判斷是否為常見手機或平板裝置
  }; // 函式結束

  const isLineInAppBrowser = () => { // 建立判斷是否為 LINE 內建瀏覽器函式
    if (typeof window === "undefined") { // 若目前不是瀏覽器環境
      return false; // 回傳 false
    } // 判斷結束

    const userAgent = window.navigator.userAgent || ""; // 取得目前瀏覽器 userAgent
    return /Line\//i.test(userAgent); // 判斷是否包含 LINE 內建瀏覽器特徵
  }; // 函式結束

  const startLineLogin = async (loginMode: "normal" | "qr") => { // 建立啟動 LINE 登入流程函式
    let childWindow: Window | null = null; // 預先宣告子視窗參考

    try { // 開始錯誤捕捉
      const isMobile = isMobileDevice(); // 判斷目前是否為手機裝置
      const inLineBrowser = isLineInAppBrowser(); // 判斷是否為 LINE 內建瀏覽器
      const useSameTabRedirect = isMobile || inLineBrowser; // 手機或 LINE 內建瀏覽器一律改用同頁跳轉
      const effectiveLoginMode = useSameTabRedirect ? "normal" : loginMode; // 同頁跳轉時一律不用 QR 模式

      appendDebugLog(`startLineLogin() 被點擊，loginMode=${loginMode}，effectiveLoginMode=${effectiveLoginMode}，isMobile=${String(isMobile)}，inLineBrowser=${String(inLineBrowser)}，useSameTabRedirect=${String(useSameTabRedirect)}`); // 紀錄按鈕點擊
      setLineLoading(effectiveLoginMode); // 記錄目前啟動中的 LINE 模式
      setError(""); // 清空舊錯誤訊息
      setLastPopupState(useSameTabRedirect ? "改用同頁跳轉" : "建立登入視窗中"); // 更新視窗狀態

      if (!useSameTabRedirect) { // 若目前不是手機也不是 LINE 內建瀏覽器，才走 PC popup 流程
        childWindow = window.open("", LINE_LOGIN_WINDOW_NAME); // 用固定名稱開啟登入視窗
        popupRef.current = childWindow; // 記錄 popup 參考

        if (!childWindow) { // 若連空白分頁都無法建立
          appendDebugLog("無法先建立空白登入分頁，疑似被瀏覽器阻擋"); // 紀錄失敗
          alert("LINE 登入視窗被瀏覽器阻擋，請允許彈出視窗後再試。"); // 提示使用者
          setLineLoading(""); // 清空 loading
          setLastPopupState("被瀏覽器阻擋"); // 更新狀態
          return; // 中止流程
        } // 判斷結束

        childWindow.focus(); // 將該登入視窗帶到前面
        setLastPopupState("空白登入分頁已建立"); // 更新狀態
        appendDebugLog("已先同步建立 / 重用固定名稱的 LINE 登入視窗"); // 紀錄成功
      } // PC popup 判斷結束

      const response = await fetch("/api/line/start", { // 呼叫產生 LINE 登入網址的 API
        method: "POST", // 使用 POST 方法
        headers: { "Content-Type": "application/json" }, // 指定 JSON 格式
        body: JSON.stringify({ flow: "manager_bind", loginMode: effectiveLoginMode, isMobile: useSameTabRedirect }), // 傳入協助人員加入流程、登入模式與裝置類型
      }); // 請求結束

      appendDebugLog(`LINE start API 回應 status=${response.status}`); // 紀錄 API 狀態碼

      const result = await response.json(); // 解析 JSON 回應
      appendDebugLog(`LINE start API 回應內容 ok=${String(result?.ok)}，message=${result?.message ?? ""}`); // 紀錄回應內容

      if (!response.ok || !result.ok) { // 若 API 回應失敗
        if (childWindow && !childWindow.closed) { // 若空白分頁仍存在
          childWindow.close(); // 失敗時關閉空白分頁
        } // 判斷結束

        popupRef.current = null; // 清空 popup ref
        setError(result.message || "無法啟動 LINE 登入流程"); // 顯示頁面錯誤訊息
        appendDebugLog("startLineLogin() 中止，API 回應失敗"); // 紀錄中止
        setLineLoading(""); // 結束 loading
        setLastPopupState("啟動失敗"); // 更新狀態
        return; // 中止流程
      } // 回應檢查結束

      if (useSameTabRedirect) { // 若目前使用同頁跳轉模式
        appendDebugLog("目前為手機或 LINE 內建瀏覽器，改用同頁 location.replace 跳轉到 LINE 登入頁"); // 紀錄行為
        window.location.replace(result.loginUrl); // 使用同頁取代跳轉，避免越開越多頁
        return; // 中止後續 popup 流程
      } // 同頁流程結束

      clearPopupMonitor(); // 先清掉舊的監看 timer

      if (childWindow && !childWindow.closed) { // 若空白分頁仍存在
        childWindow.location.href = result.loginUrl; // 將空白分頁導向 LINE 登入網址
        childWindow.focus(); // 再帶到前面
      } // 判斷結束

      setLastPopupState("LINE 登入頁已開啟"); // 更新 popup 狀態
      appendDebugLog("已把固定登入視窗導向 LINE 登入頁"); // 紀錄成功

      popupMonitorTimerRef.current = window.setInterval(() => { // 每秒監看一次 popup 是否關閉
        if (popupRef.current && popupRef.current.closed) { // 若 popup 已關閉
          appendDebugLog("偵測到 LINE / 登入視窗已關閉"); // 紀錄 popup 關閉
          clearPopupMonitor(); // 清除監看 timer
          popupRef.current = null; // 清空 popup ref
          setLastPopupState("視窗已關閉"); // 更新 popup 狀態
          resetTransientState(); // 清空暫存狀態
          reloadManagersSafely("popup_closed_reload"); // 關閉後主動重新讀資料
        } // 判斷結束
      }, 1000); // 每 1 秒檢查一次
    } catch (e) { // 若請求過程發生錯誤
      console.error("startLineLogin error:", e); // 印出錯誤
      if (childWindow && !childWindow.closed) { // 若空白分頁仍存在
        childWindow.close(); // 例外時關閉空白分頁
      } // 判斷結束
      popupRef.current = null; // 清空 popup ref
      appendDebugLog(`startLineLogin() 失敗：${e instanceof Error ? e.message : String(e)}`); // 紀錄錯誤
      setError("無法啟動 LINE 登入流程"); // 顯示頁面錯誤訊息
      setLineLoading(""); // 結束 loading
      setLastPopupState("執行例外"); // 更新 popup 狀態
    } // 錯誤捕捉結束
  }; // startLineLogin 函式結束

  const goPasswordLogin = () => { // 建立帳號密碼登入固定視窗函式
    appendDebugLog("goPasswordLogin() 被點擊"); // 紀錄帳密按鈕點擊

    const isMobile = isMobileDevice(); // 判斷目前是否為手機裝置
    const inLineBrowser = isLineInAppBrowser(); // 判斷是否為 LINE 內建瀏覽器
    const useSameTabRedirect = isMobile || inLineBrowser; // 手機或 LINE 內建瀏覽器改用同頁跳轉
    const loginUrl = `/login?flow=manager_bind&popup=1&t=${Date.now()}`; // 建立登入頁網址

    if (useSameTabRedirect) { // 若目前使用同頁跳轉模式
      appendDebugLog("帳號 / 密碼登入改用同頁 location.assign 跳轉"); // 紀錄行為
      window.location.assign(loginUrl); // 使用同頁跳轉
      return; // 中止後續 popup 流程
    } // 判斷結束

    const loginWindow = window.open(loginUrl, PASSWORD_LOGIN_WINDOW_NAME); // 以固定名稱開啟登入頁

    if (!loginWindow) { // 若新分頁被瀏覽器阻擋
      alert("帳號 / 密碼登入視窗被瀏覽器阻擋，請允許彈出視窗後再試。"); // 提示使用者
      appendDebugLog("goPasswordLogin() 失敗，登入視窗被瀏覽器阻擋"); // 紀錄失敗
      return; // 中止流程
    } // 判斷結束

    loginWindow.focus(); // 將登入視窗帶到前面
    appendDebugLog("帳號 / 密碼登入已改用固定名稱視窗開啟"); // 紀錄成功
  }; // 函式結束

  const handleManualReload = () => { // 建立手動重新讀取函式
    appendDebugLog("handleManualReload() 被點擊"); // 紀錄手動重新讀取
    loadManagers("manual_reload_button"); // 手動重新讀資料
  }; // 函式結束

  const dialogTitle = noticeType === "success" // 判斷提示視窗標題
    ? "操作成功" // 成功標題
    : noticeType === "warning" // 若為警告
    ? "提醒" // 警告標題
    : noticeType === "error" // 若為錯誤
    ? "發生錯誤" // 錯誤標題
    : ""; // 預設空字串

  const dialogButtonClass = noticeType === "success" // 判斷提示視窗按鈕樣式
    ? "bg-green-600 text-white hover:bg-green-700" // 成功按鈕
    : noticeType === "warning" // 若為警告
    ? "bg-yellow-500 text-white hover:bg-yellow-600" // 警告按鈕
    : noticeType === "error" // 若為錯誤
    ? "bg-red-600 text-white hover:bg-red-700" // 錯誤按鈕
    : "bg-slate-600 text-white hover:bg-slate-700"; // 預設按鈕

  if (relayClosing) { // 若目前頁是登入子視窗回來的 relay 頁
    return ( // 顯示簡單處理中畫面
      <main className="flex items-center justify-center p-4 md:p-6"> {/* 最外層容器 */}
        <div className="rounded-2xl border bg-white px-8 py-6 text-center shadow-sm"> {/* 處理中卡片 */}
          <div className="mb-2 text-xl font-bold">登入結果處理中</div> {/* 標題 */}
          <div className="text-gray-600">正在返回主頁，這個視窗會自動關閉…</div> {/* 說明 */}
        </div>
      </main>
    ); // 回傳畫面結束
  } // relay 畫面結束

  return ( // 回傳畫面開始
    <>
      <main className="p-4 md:p-6"> {/* 最外層容器 */}
        <div className="w-full max-w-[1400px]"> {/* 內容容器 */}
          <div className="mb-4"> {/* 返回鍵區塊 */}
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border-2 border-gray-400 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50"
            >
              返回首頁
            </Link>
          </div>

          <h1 className="mb-2 text-2xl font-bold">協助人員管理</h1> {/* 頁面標題 */}

          <p className="mb-6 text-gray-600"> {/* 頁面說明文字 */}
            這裡先測試讀取與 LINE 綁定 Investors3 / members 子集合資料
          </p>

          <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm"> {/* LINE 綁定入口區塊 */}
            <h2 className="mb-3 text-xl font-semibold">新增協助人員（LINE綁定）</h2>

            <p className="mb-4 text-gray-600">
              不再手動輸入 memberId、姓名、Email，改由 LINE 登入後自動取得 LINE 資料並回填到 Investors3 的 members 子集合。
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <button
                type="button"
                onClick={() => startLineLogin("normal")}
                disabled={lineLoading !== ""}
                className="inline-flex items-center justify-center rounded-xl bg-green-500 px-5 py-3 font-semibold text-white hover:bg-green-600 disabled:opacity-50"
              >
                {lineLoading === "normal" ? "啟動中..." : "前往 LINE 綁定頁"}
              </button>

              <div className="hidden md:block"> {/* 手機隱藏，桌機才顯示 QR 登入按鈕 */}
                <button
                  type="button"
                  onClick={() => startLineLogin("qr")}
                  disabled={lineLoading !== ""}
                  className="inline-flex w-full items-center justify-center rounded-xl border-2 border-green-500 bg-white px-5 py-3 font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  {lineLoading === "qr" ? "啟動中..." : "優先顯示 QR 登入"}
                </button>
              </div>

              <button
                type="button"
                onClick={goPasswordLogin}
                className="inline-flex items-center justify-center rounded-xl border-2 border-slate-400 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                帳號 / 密碼登入
              </button>

              <button
                type="button"
                onClick={handleManualReload}
                className="inline-flex items-center justify-center rounded-xl border-2 border-blue-400 bg-white px-5 py-3 font-semibold text-blue-700 hover:bg-blue-50"
              >
                重新讀取名單
              </button>

              <button
                type="button"
                onClick={() => setShowDebugPanel((prev) => !prev)}
                className="inline-flex items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
              >
                {showDebugPanel ? "隱藏除錯資訊" : "顯示除錯資訊"}
              </button>
            </div>
          </div>

          {showDebugPanel && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"> {/* Debug 區塊 */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-700">除錯資訊 Debug Log</h3>
                <div className="text-xs text-slate-500">loadManagers 次數：{loadManagersCount}</div>
              </div>

              <div className="mb-3 grid gap-3 text-xs text-slate-600 md:grid-cols-2">
                <div>didHydrate：{String(didHydrate)}</div>
                <div>loading：{String(loading)}</div>
                <div>lineLoading：{lineLoading || "(空)"}</div>
                <div>deletingId：{deletingId || "(空)"}</div>
                <div>items.length：{items.length}</div>
                <div>popupState：{lastPopupState}</div>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border bg-white p-3 text-xs text-slate-700">
                {debugLogs.length === 0 ? (
                  <div>目前尚無 debug 訊息</div>
                ) : (
                  debugLogs.map((log, index) => (
                    <div key={`${log}-${index}`} className="whitespace-pre-wrap break-all">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              讀取中...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600">
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              目前沒有協助人員資料
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      {item.linePictureUrl ? (
                        <img
                          src={item.linePictureUrl}
                          alt={item.name || item.id}
                          className="h-16 w-16 shrink-0 rounded-full border object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border bg-gray-100 text-sm text-gray-400">
                          無頭像
                        </div>
                      )}

                      <div className="min-w-0 space-y-1">
                        <div className="break-words text-lg font-semibold">
                          {item.name || "未填寫姓名"}
                        </div>
                        <div className="break-all text-sm text-gray-500">
                          文件ID：{item.id}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, item.role)}
                      disabled={deletingId === item.id || item.role === "owner"}
                      className="w-full rounded-xl bg-red-500 px-4 py-2 font-semibold text-white disabled:opacity-50 md:w-auto"
                    >
                      {item.role === "owner" ? "owner不可刪除" : deletingId === item.id ? "刪除中..." : "刪除此名單"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showNoticeDialog && noticeText && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"> {/* 中間彈出提示視窗背景遮罩 */}
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"> {/* 提示視窗卡片 */}
            <div className="mb-3 text-2xl font-bold text-gray-900">{dialogTitle}</div> {/* 提示標題 */}
            <div className="mb-6 whitespace-pre-wrap break-words text-base leading-8 text-gray-700">{noticeText}</div> {/* 提示文字 */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeNoticeDialog}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold ${dialogButtonClass}`}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  ); // 畫面回傳結束
} // 元件結束