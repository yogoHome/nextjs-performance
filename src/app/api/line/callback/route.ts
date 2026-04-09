import { NextRequest, NextResponse } from "next/server"; // 匯入 Next.js request 與 response 物件
import { FieldValue } from "firebase-admin/firestore"; // 匯入 Firebase Admin 伺服器時間工具
import { adminDb } from "../../../../lib/firebase-admin"; // 匯入 Admin Firestore
import { parseLineState } from "../../../../lib/line-state"; // 匯入 state 解析工具函式

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID || ""; // 讀取 LINE Channel ID
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || ""; // 讀取 LINE Channel Secret
const LINE_CALLBACK_URL = process.env.LINE_CALLBACK_URL || ""; // 讀取 LINE callback URL
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000"; // 讀取網站基底網址

export async function GET(request: NextRequest) { // 建立 LINE callback 的 GET API
  try { // 開始錯誤捕捉
    const searchParams = request.nextUrl.searchParams; // 取得網址查詢參數
    const code = searchParams.get("code") || ""; // 取得 LINE 回傳的 code
    const state = searchParams.get("state") || ""; // 取得 LINE 回傳的 state
    const error = searchParams.get("error") || ""; // 取得 LINE 回傳的 error
    const errorDescription = searchParams.get("error_description") || ""; // 取得 LINE 回傳的錯誤描述

    if (error) { // 若 LINE 回傳錯誤
      return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent(errorDescription || error)}`); // 導回共用登入頁並帶上錯誤
    } // 錯誤檢查結束

    if (!code || !state) { // 若缺少必要參數
      return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE callback 缺少必要參數")}`); // 導回共用登入頁並帶上錯誤
    } // 必要參數檢查結束

    if (!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET || !LINE_CALLBACK_URL) { // 若 LINE 必要環境變數未設定完整
      return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE 環境變數未設定完整")}`); // 導回共用登入頁並帶上錯誤
    } // 環境變數檢查結束

    const parsedState = parseLineState(state); // 解析 state
    const vendorId = parsedState.vendorId; // 取出 vendorId
    const flow = parsedState.flow; // 取出流程類型

    const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", { // 向 LINE 交換 access token
      method: "POST", // 使用 POST 方法
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, // 指定表單格式
      body: new URLSearchParams({ // 建立 token 交換需要的表單資料
        grant_type: "authorization_code", // OAuth grant type
        code, // callback 回來的 code
        redirect_uri: LINE_CALLBACK_URL, // callback URL
        client_id: LINE_CHANNEL_ID, // LINE Channel ID
        client_secret: LINE_CHANNEL_SECRET, // LINE Channel Secret
      }).toString(), // 轉成表單字串
    }); // token 交換請求結束

    if (!tokenResponse.ok) { // 若 token 交換失敗
      const tokenErrorText = await tokenResponse.text(); // 讀取錯誤內容
      console.error("LINE token error:", tokenErrorText); // 印出錯誤內容
      return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE token 交換失敗")}`); // 導回共用登入頁並帶上錯誤
    } // token 檢查結束

    const tokenData = await tokenResponse.json(); // 解析 token JSON
    const accessToken = tokenData.access_token as string; // 取得 access token

    const profileResponse = await fetch("https://api.line.me/v2/profile", { // 使用 access token 取得 LINE 使用者 profile
      headers: { Authorization: `Bearer ${accessToken}` }, // 帶入 Bearer token
    }); // profile 請求結束

    if (!profileResponse.ok) { // 若 profile 取得失敗
      const profileErrorText = await profileResponse.text(); // 讀取錯誤內容
      console.error("LINE profile error:", profileErrorText); // 印出錯誤內容
      return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE profile 取得失敗")}`); // 導回共用登入頁並帶上錯誤
    } // profile 檢查結束

    const profileData = await profileResponse.json(); // 解析 profile JSON
    const lineUserId = profileData.userId || ""; // 取得 LINE userId
    const lineDisplayName = profileData.displayName || ""; // 取得 LINE 顯示名稱
    const linePictureUrl = profileData.pictureUrl || ""; // 取得 LINE 頭像網址

    if (!lineUserId) { // 若沒有拿到 lineUserId
      return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE userId 取得失敗")}`); // 導回共用登入頁並帶上錯誤
    } // lineUserId 檢查結束

    const membersCollectionRef = adminDb.collection("Investors3").doc(vendorId).collection("members"); // 建立 members 子集合參考
    const existingSnapshot = await membersCollectionRef.where("lineUserId", "==", lineUserId).limit(1).get(); // 用 lineUserId 查詢是否已存在

    if (flow === "manager_bind") { // 若目前流程是新增協助人員
      if (!existingSnapshot.empty) { // 若同一個 LINE 已經存在
        return NextResponse.redirect(`${APP_BASE_URL}/managers?lineExists=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}`); // 導回 managers 頁並提示已存在
      } // 已存在檢查結束

      const newDocId = `manager_${Date.now()}`; // 建立新的正式 manager 文件 ID
      const newMemberRef = membersCollectionRef.doc(newDocId); // 建立新的文件路徑

      await newMemberRef.set( // 寫入新的正式 manager 文件
        {
          memberId: newDocId, // 寫入 memberId
          vendorId, // 寫入 vendorId
          email: "", // Email 先留空
          firebaseUid: "", // Firebase UID 先留空
          name: lineDisplayName || "", // 使用 LINE 顯示名稱作為姓名
          role: "manager", // 新增時固定先給 manager
          status: "active", // 狀態預設 active
          lineUserId, // 寫入 LINE userId
          lineDisplayName, // 寫入 LINE 顯示名稱
          linePictureUrl, // 寫入 LINE 頭像網址
          lineBound: true, // 標記已綁定 LINE
          bindStatus: "bound", // 綁定狀態設為 bound
          allowManageInvestors1: true, // 預設可管理案件
          allowManageDeals: true, // 預設可管理成交案件
          allowManageAgents: true, // 預設可管理業務
          allowManageManagers: false, // 預設不可管理協助人員
          createdAt: FieldValue.serverTimestamp(), // 建立時間
          updatedAt: FieldValue.serverTimestamp(), // 更新時間
        },
        { merge: true } // 使用 merge 模式寫入
      ); // 新文件寫入結束

      return NextResponse.redirect(`${APP_BASE_URL}/managers?lineSuccess=1`); // 導回 managers 頁並提示新增成功
    } // manager_bind 流程結束

    if (existingSnapshot.empty) { // 若是系統登入流程，但查不到這個 LINE
      return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent("這個 LINE 尚未加入協助管理人員，請先由主管理者新增。")}`); // 導回共用登入頁並提示尚未加入
    } // system_login 查無資料檢查結束

    return NextResponse.redirect(`${APP_BASE_URL}/managers?systemLineLogin=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}`); // 系統登入成功後先導回 managers 頁，後續可再改成 dashboard
  } catch (callbackError) { // 若 callback 發生任何未預期錯誤
    console.error("LINE callback error:", callbackError); // 在伺服器端印出錯誤
    return NextResponse.redirect(`${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE callback 發生錯誤")}`); // 導回共用登入頁並帶上錯誤
  } // 錯誤捕捉結束
} // GET API 結束