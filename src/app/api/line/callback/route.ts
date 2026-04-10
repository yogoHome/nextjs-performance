import { NextRequest, NextResponse } from "next/server"; // 匯入 Next.js request 與 response 物件
import { FieldValue } from "firebase-admin/firestore"; // 匯入 Firebase Admin 伺服器時間工具
import { adminDb } from "../../../../lib/firebase-admin"; // 匯入 Admin Firestore
import { parseLineState } from "../../../../lib/line-state"; // 匯入 state 解析工具函式

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID || ""; // 讀取 LINE Channel ID 環境變數
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || ""; // 讀取 LINE Channel Secret 環境變數
const LINE_CALLBACK_URL = process.env.LINE_CALLBACK_URL || ""; // 讀取 LINE callback URL 環境變數
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000"; // 讀取網站基底網址環境變數，未設定時暫時使用 localhost

export async function GET(request: NextRequest) { // 建立 LINE callback 的 GET API
  try { // 開始錯誤捕捉
    const searchParams = request.nextUrl.searchParams; // 取得網址查詢參數
    const code = searchParams.get("code") || ""; // 取得 LINE 回傳的授權 code
    const state = searchParams.get("state") || ""; // 取得 LINE 回傳的 state
    const error = searchParams.get("error") || ""; // 取得 LINE 回傳的 error
    const errorDescription = searchParams.get("error_description") || ""; // 取得 LINE 回傳的錯誤描述

    if (error) { // 若 LINE 回傳錯誤
      return NextResponse.redirect( // 導回登入頁並帶上錯誤訊息
        `${APP_BASE_URL}/login?lineError=${encodeURIComponent(errorDescription || error)}` // 組合錯誤導向網址
      ); // 回傳 redirect
    } // 錯誤檢查結束

    if (!code || !state) { // 若 callback 缺少必要參數
      return NextResponse.redirect( // 導回登入頁並提示缺少參數
        `${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE callback 缺少必要參數")}` // 組合錯誤導向網址
      ); // 回傳 redirect
    } // 必要參數檢查結束

    const missingKeys: string[] = []; // 建立缺漏環境變數陣列

    if (!LINE_CHANNEL_ID) { // 若未設定 LINE Channel ID
      missingKeys.push("LINE_CHANNEL_ID"); // 記錄缺漏項目
    } // 判斷結束

    if (!LINE_CHANNEL_SECRET) { // 若未設定 LINE Channel Secret
      missingKeys.push("LINE_CHANNEL_SECRET"); // 記錄缺漏項目
    } // 判斷結束

    if (!LINE_CALLBACK_URL) { // 若未設定 LINE callback URL
      missingKeys.push("LINE_CALLBACK_URL"); // 記錄缺漏項目
    } // 判斷結束

    if (!APP_BASE_URL) { // 若未設定網站基底網址
      missingKeys.push("NEXT_PUBLIC_APP_BASE_URL"); // 記錄缺漏項目
    } // 判斷結束

    if (missingKeys.length > 0) { // 若有任一必要環境變數缺漏
      return NextResponse.redirect( // 導回登入頁並提示環境變數不完整
        `${APP_BASE_URL}/login?lineError=${encodeURIComponent(`LINE 環境變數未設定完整：${missingKeys.join("、")}`)}` // 組合錯誤導向網址
      ); // 回傳 redirect
    } // 環境變數檢查結束

    const parsedState = parseLineState(state); // 解析 LINE callback 帶回的 state
    const vendorId = parsedState.vendorId; // 取出 vendorId
    const flow = parsedState.flow; // 取出流程類型

    const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", { // 向 LINE token API 交換 access token
      method: "POST", // 使用 POST 方法
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, // 指定表單格式
      body: new URLSearchParams({ // 建立 token 交換需要的表單資料
        grant_type: "authorization_code", // OAuth grant type 固定為 authorization_code
        code, // callback 回來的授權 code
        redirect_uri: LINE_CALLBACK_URL, // callback URL
        client_id: LINE_CHANNEL_ID, // LINE Channel ID
        client_secret: LINE_CHANNEL_SECRET, // LINE Channel Secret
      }).toString(), // 轉成表單字串
    }); // token 請求結束

    if (!tokenResponse.ok) { // 若 token 交換失敗
      const tokenErrorText = await tokenResponse.text(); // 讀取錯誤內容文字
      console.error("LINE token error:", tokenErrorText); // 在伺服器端印出 token 錯誤
      return NextResponse.redirect( // 導回登入頁並提示 token 交換失敗
        `${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE token 交換失敗")}` // 組合錯誤導向網址
      ); // 回傳 redirect
    } // token 檢查結束

    const tokenData = await tokenResponse.json(); // 解析 token JSON
    const accessToken = tokenData.access_token as string; // 取得 access token

    const profileResponse = await fetch("https://api.line.me/v2/profile", { // 使用 access token 取得 LINE 使用者 profile
      headers: { Authorization: `Bearer ${accessToken}` }, // 帶入 Bearer token
    }); // profile 請求結束

    if (!profileResponse.ok) { // 若 profile 取得失敗
      const profileErrorText = await profileResponse.text(); // 讀取錯誤內容文字
      console.error("LINE profile error:", profileErrorText); // 在伺服器端印出 profile 錯誤
      return NextResponse.redirect( // 導回登入頁並提示 profile 取得失敗
        `${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE profile 取得失敗")}` // 組合錯誤導向網址
      ); // 回傳 redirect
    } // profile 檢查結束

    const profileData = await profileResponse.json(); // 解析 profile JSON
    const lineUserId = profileData.userId || ""; // 取得 LINE userId
    const lineDisplayName = profileData.displayName || ""; // 取得 LINE 顯示名稱
    const linePictureUrl = profileData.pictureUrl || ""; // 取得 LINE 頭像網址

    if (!lineUserId) { // 若沒有拿到 lineUserId
      return NextResponse.redirect( // 導回登入頁並提示 userId 取得失敗
        `${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE userId 取得失敗")}` // 組合錯誤導向網址
      ); // 回傳 redirect
    } // userId 檢查結束

    const membersCollectionRef = adminDb.collection("Investors3").doc(vendorId).collection("members"); // 建立 members 子集合參考
    const existingSnapshot = await membersCollectionRef.where("lineUserId", "==", lineUserId).limit(1).get(); // 以 lineUserId 查詢是否已存在相同資料

    if (flow === "manager_bind") { // 若目前流程是新增協助人員綁定
      if (!existingSnapshot.empty) { // 若同一個 LINE 已存在
        return NextResponse.redirect( // 導回 managers 頁並提示已存在
          `${APP_BASE_URL}/managers?lineExists=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}` // 組合已存在導向網址
        ); // 回傳 redirect
      } // 已存在檢查結束

      const newDocId = `manager_${Date.now()}`; // 建立新的正式 manager 文件 ID
      const newMemberRef = membersCollectionRef.doc(newDocId); // 建立新的文件參考

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
      ); // 文件寫入結束

      return NextResponse.redirect( // 導回 managers 頁並提示綁定成功
        `${APP_BASE_URL}/managers?lineSuccess=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}` // 組合成功導向網址
      ); // 回傳 redirect
    } // manager_bind 流程結束

    if (existingSnapshot.empty) { // 若是系統登入流程，但查不到這個 LINE
      return NextResponse.redirect( // 導回登入頁並提示尚未加入協助管理人員
        `${APP_BASE_URL}/login?lineError=${encodeURIComponent("這個 LINE 尚未加入協助管理人員，請先由主管理者新增。")}` // 組合錯誤導向網址
      ); // 回傳 redirect
    } // 查無資料檢查結束

    return NextResponse.redirect( // 系統登入成功後先導回 managers 頁，後續可再改成 dashboard
      `${APP_BASE_URL}/managers?systemLineLogin=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}` // 組合成功導向網址
    ); // 回傳 redirect
  } catch (callbackError) { // 若 callback 發生任何未預期錯誤
    console.error("LINE callback error:", callbackError); // 在伺服器端印出錯誤
    return NextResponse.redirect( // 導回登入頁並提示 callback 發生錯誤
      `${APP_BASE_URL}/login?lineError=${encodeURIComponent("LINE callback 發生錯誤")}` // 組合錯誤導向網址
    ); // 回傳 redirect
  } // 錯誤捕捉結束
} // GET API 結束