import { NextResponse } from "next/server"; // 匯入 Next.js API 回應物件
import { createLineState } from "../../../../lib/line-state"; // 匯入 LINE state 工具函式

const VENDOR_ID = process.env.BOOTSTRAP_VENDOR_ID || "vendor-yogo-001"; // 讀取目前廠商代號
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID || ""; // 讀取 LINE Channel ID
const LINE_CALLBACK_URL = process.env.LINE_CALLBACK_URL || ""; // 讀取 LINE callback URL

export async function POST() { // 建立 POST API，用來產生 LINE 官方登入網址
  try { // 開始錯誤捕捉
    if (!LINE_CHANNEL_ID || !LINE_CALLBACK_URL) { // 若 LINE 必要環境變數未設定完整
      return NextResponse.json( // 回傳錯誤 JSON
        { ok: false, message: "LINE 環境變數未設定完整" }, // 錯誤內容
        { status: 500 } // HTTP 狀態碼
      ); // JSON 回傳結束
    } // 環境變數檢查結束

    const state = createLineState(VENDOR_ID, "manager_bind"); // 產生要帶給 callback 的 state 字串
    const authUrl = new URL("https://access.line.me/oauth2/v2.1/authorize"); // 建立 LINE 授權網址物件

    authUrl.searchParams.set("response_type", "code"); // 設定 OAuth response_type
    authUrl.searchParams.set("client_id", LINE_CHANNEL_ID); // 設定 LINE Channel ID
    authUrl.searchParams.set("redirect_uri", LINE_CALLBACK_URL); // 設定 callback URL
    authUrl.searchParams.set("state", state); // 設定 state
    authUrl.searchParams.set("scope", "profile openid"); // 設定 scope，先拿 profile 與 openid
    authUrl.searchParams.set("prompt", "consent"); // 測試階段先強制顯示同意畫面，方便反覆測試

    return NextResponse.json({ // 回傳成功 JSON
      ok: true, // 成功標記
      loginUrl: authUrl.toString(), // 回傳 LINE 官方登入網址
    }); // JSON 回傳結束
  } catch (error) { // 若發生任何未預期錯誤
    console.error("create line url error:", error); // 在伺服器端印出錯誤
    return NextResponse.json( // 回傳失敗 JSON
      { ok: false, message: "建立 LINE 登入網址失敗" }, // 錯誤內容
      { status: 500 } // HTTP 狀態碼
    ); // JSON 回傳結束
  } // 錯誤捕捉結束
} // POST API 結束