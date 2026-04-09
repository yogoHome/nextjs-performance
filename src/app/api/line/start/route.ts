import { NextRequest, NextResponse } from "next/server"; // 匯入 Next.js request 與 response 物件
import { createLineState, type LineFlow } from "../../../../lib/line-state"; // 匯入 LINE state 工具函式與流程型別

const VENDOR_ID = process.env.BOOTSTRAP_VENDOR_ID || "vendor-yogo-001"; // 讀取目前廠商代號
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID || ""; // 讀取 LINE Channel ID
const LINE_CALLBACK_URL = process.env.LINE_CALLBACK_URL || ""; // 讀取 LINE callback URL

export async function POST(request: NextRequest) { // 建立 POST API，用來產生 LINE 官方登入網址
  try { // 開始錯誤捕捉
    if (!LINE_CHANNEL_ID || !LINE_CALLBACK_URL) { // 若 LINE 必要環境變數未設定完整
      return NextResponse.json({ ok: false, message: "LINE 環境變數未設定完整" }, { status: 500 }); // 回傳錯誤 JSON
    } // 檢查結束

    const body = await request.json().catch(() => ({})); // 讀取前端傳來的 JSON，若失敗則給空物件
    const flow = (body.flow as LineFlow) || "system_login"; // 取得流程類型，預設為系統登入
    const loginMode = (body.loginMode as "normal" | "qr") || "normal"; // 取得登入模式，normal=一般登入，qr=直接顯示 QR
    const state = createLineState(VENDOR_ID, flow); // 產生 LINE callback 要用的 state
    const authUrl = new URL("https://access.line.me/oauth2/v2.1/authorize"); // 建立 LINE 授權網址物件

    authUrl.searchParams.set("response_type", "code"); // 設定 OAuth response_type
    authUrl.searchParams.set("client_id", LINE_CHANNEL_ID); // 設定 LINE Channel ID
    authUrl.searchParams.set("redirect_uri", LINE_CALLBACK_URL); // 設定 callback URL
    authUrl.searchParams.set("state", state); // 設定 state
    authUrl.searchParams.set("scope", "profile openid"); // 設定 scope，先拿 profile 與 openid
    authUrl.searchParams.set("ui_locales", "zh-TW"); // 設定介面語系為繁體中文
    authUrl.searchParams.set("prompt", "login"); // 強制每次都顯示登入驗證畫面，不沿用上次登入狀態
    authUrl.searchParams.set("disable_auto_login", "true"); // 停用 auto login，避免自動登入
    authUrl.searchParams.set("disable_ios_auto_login", "true"); // iOS 也停用 auto login

    if (loginMode === "qr") { // 若目前模式是直接顯示 QR Code 登入
      authUrl.searchParams.set("initial_amr_display", "lineqr"); // 預設顯示 QR code 登入畫面
      authUrl.searchParams.set("switch_amr", "false"); // 隱藏切換登入方式按鈕
    } // QR 模式設定結束

    return NextResponse.json({ ok: true, loginUrl: authUrl.toString() }); // 回傳成功 JSON 與 LINE 登入網址
  } catch (error) { // 若發生未預期錯誤
    console.error("create line url error:", error); // 在伺服器端印出錯誤
    return NextResponse.json({ ok: false, message: "建立 LINE 登入網址失敗" }, { status: 500 }); // 回傳失敗 JSON
  } // 錯誤捕捉結束
} // POST API 結束