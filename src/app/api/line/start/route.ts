import { NextRequest, NextResponse } from "next/server"; // 匯入 Next.js Route Handler 所需的 request 與 response 型別
import crypto from "crypto"; // 匯入 Node.js 內建 crypto，用來產生安全的 state 字串

function isMobileUserAgent(userAgent: string): boolean { // 判斷是否為手機或平板裝置的 UA
  return /iPhone|iPad|iPod|Android|Mobile|Windows Phone/i.test(userAgent); // 用常見行動裝置關鍵字判斷
} // 函式結束

function isLineInAppUserAgent(userAgent: string): boolean { // 判斷是否為 LINE 內建瀏覽器的 UA
  return /Line\//i.test(userAgent) || /LIFF/i.test(userAgent); // 若 UA 含有 LINE 或 LIFF 字樣，視為 LINE 內建瀏覽器
} // 函式結束

function toBool(value: string | null): boolean { // 將 query 參數常見值轉為布林值
  if (!value) return false; // 若沒有值則回傳 false
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes"; // 支援 1 / true / yes 三種常見寫法
} // 函式結束

export async function GET(request: NextRequest) { // 匯出 GET route handler
  try { // 進入例外處理區塊
    const channelId = process.env.LINE_CHANNEL_ID || ""; // 讀取 LINE Login Channel ID
    const callbackUrl = process.env.LINE_CALLBACK_URL || ""; // 讀取 LINE callback URL
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || ""; // 讀取站台 base URL
    const rawScope = process.env.LINE_LOGIN_SCOPE || "profile openid"; // 讀取 scope，若未設定則使用 profile + openid
    const rawBotPrompt = process.env.LINE_BOT_PROMPT || "normal"; // 讀取 bot_prompt，若未設定則預設 normal

    if (!channelId) { // 若缺少 LINE_CHANNEL_ID
      return NextResponse.json({ ok: false, error: "缺少環境變數 LINE_CHANNEL_ID" }, { status: 500 }); // 回傳清楚錯誤
    } // 判斷結束

    if (!callbackUrl) { // 若缺少 LINE_CALLBACK_URL
      return NextResponse.json({ ok: false, error: "缺少環境變數 LINE_CALLBACK_URL" }, { status: 500 }); // 回傳清楚錯誤
    } // 判斷結束

    if (!appBaseUrl) { // 若缺少 NEXT_PUBLIC_APP_BASE_URL
      return NextResponse.json({ ok: false, error: "缺少環境變數 NEXT_PUBLIC_APP_BASE_URL" }, { status: 500 }); // 回傳清楚錯誤
    } // 判斷結束

    const url = new URL(request.url); // 取得目前請求網址物件
    const flow = url.searchParams.get("flow") || "manager_bind"; // 讀取流程代號，預設 manager_bind
    const preferSameTab = toBool(url.searchParams.get("preferSameTab")); // 讀取前端要求是否偏好同頁
    const disableAutoLogin = toBool(url.searchParams.get("disableAutoLogin")); // 讀取是否停用 auto-login 的 fallback 開關
    const userAgent = request.headers.get("user-agent") || ""; // 取得目前請求的 User-Agent
    const isMobile = isMobileUserAgent(userAgent); // 判斷是否為手機裝置
    const isLineInApp = isLineInAppUserAgent(userAgent); // 判斷是否為 LINE 內建瀏覽器

    const mode = isMobile || isLineInApp ? "normal" : "qr"; // 手機與 LINE 內建瀏覽器固定 normal，桌機才可用 qr
    const finalPreferSameTab = preferSameTab || isMobile || isLineInApp; // 手機或 LINE 內一律視為同頁跳轉

    const statePayload = { // 建立要塞進 state 的資訊物件
      nonce: crypto.randomUUID(), // 產生一次性隨機值，避免 CSRF 與重放
      flow, // 記錄目前流程代號
      returnTo: "/managers", // 成功後預設回 managers 頁
      mode, // 記錄這次後端判定的模式
      ts: Date.now(), // 記錄產生時間戳記，方便除錯
    }; // 物件結束

    const state = Buffer.from(JSON.stringify(statePayload), "utf8").toString("base64url"); // 將 state 轉成 base64url 字串供 LINE 授權使用
    const nonce = crypto.randomUUID(); // 產生 OpenID Connect 用的 nonce 值
    const scope = rawScope.trim(); // 去除 scope 首尾空白
    const botPrompt = rawBotPrompt === "aggressive" ? "aggressive" : "normal"; // 僅允許 LINE 規範值 aggressive 或 normal

    const authorizeUrl = new URL("https://access.line.me/oauth2/v2.1/authorize"); // 建立 LINE Login 授權網址物件
    authorizeUrl.searchParams.set("response_type", "code"); // 設定 OAuth response_type 為 code
    authorizeUrl.searchParams.set("client_id", channelId); // 設定 LINE Channel ID
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl); // 設定 callback URL
    authorizeUrl.searchParams.set("state", state); // 設定 state 參數
    authorizeUrl.searchParams.set("scope", scope); // 設定要請求的 scope
    authorizeUrl.searchParams.set("nonce", nonce); // 設定 nonce 參數
    authorizeUrl.searchParams.set("bot_prompt", botPrompt); // 設定是否顯示加好友提示
    authorizeUrl.searchParams.set("ui_locales", "zh-TW"); // 指定 LINE 授權畫面語系為繁體中文

    if (disableAutoLogin) { // 若這次是 auto-login 失敗後的重新登入
      authorizeUrl.searchParams.set("disable_auto_login", "true"); // 關閉 auto-login，避免一直自動登入失敗循環
    } // 判斷結束

    const loginUrl = authorizeUrl.toString(); // 轉成完整授權網址字串

    return NextResponse.json( // 回傳給前端 JSON 結果
      {
        ok: true, // 表示請求成功
        flow, // 回傳此次流程代號
        mode, // 回傳此次模式 normal / qr
        loginUrl, // 回傳 LINE 授權網址
        preferSameTab: finalPreferSameTab, // 回傳前端是否應同頁跳轉
        disableAutoLogin, // 回傳這次是否停用 auto-login
        debug: { // 回傳少量除錯資訊，方便你觀察目前判斷是否正確
          isMobile, // 是否判斷為手機
          isLineInApp, // 是否判斷為 LINE 內建瀏覽器
          callbackUrl, // 實際使用的 callback URL
          appBaseUrl, // 實際使用的 base URL
        }, // debug 結束
      },
      { status: 200 }, // 設定 HTTP 狀態碼為 200
    ); // JSON 回傳結束
  } catch (error: any) { // 捕捉 route handler 執行時的例外
    return NextResponse.json( // 回傳錯誤 JSON
      {
        ok: false, // 表示請求失敗
        error: error?.message || "LINE 啟動流程發生未預期錯誤", // 回傳錯誤訊息
      },
      { status: 500 }, // 設定 HTTP 狀態碼為 500
    ); // 錯誤 JSON 回傳結束
  } // catch 結束
} // GET handler 結束