import { NextRequest, NextResponse } from "next/server"; // 匯入 Next.js request 與 response 物件
import { FieldValue } from "firebase-admin/firestore"; // 匯入 Firebase Admin 的伺服器時間工具
import { adminDb } from "../../../../lib/firebase-admin"; // 匯入 Admin Firestore
import { parseLineState } from "../../../../lib/line-state"; // 匯入 LINE state 解析工具函式

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID || ""; // 讀取 LINE Channel ID 環境變數
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || ""; // 讀取 LINE Channel Secret 環境變數
const LINE_CALLBACK_URL = process.env.LINE_CALLBACK_URL || ""; // 讀取 LINE callback URL 環境變數
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000"; // 讀取網站基底網址環境變數，未設定時暫時使用 localhost

function escapeHtml(value: string): string { // 建立 HTML 跳脫函式，避免訊息文字破壞頁面內容
  return value // 回傳處理後字串
    .replaceAll("&", "&amp;") // 先把 & 換成 HTML entity
    .replaceAll("<", "&lt;") // 把 < 換成 HTML entity
    .replaceAll(">", "&gt;") // 把 > 換成 HTML entity
    .replaceAll('"', "&quot;") // 把雙引號換成 HTML entity
    .replaceAll("'", "&#39;"); // 把單引號換成 HTML entity
} // 函式結束

function buildPopupCallbackHtml(params: { resultType: "success" | "exists" | "error"; lineDisplayName?: string; message?: string }) { // 建立 popup 回傳主頁並自動關閉的小頁面 HTML
  const resultType = params.resultType; // 取出結果類型
  const lineDisplayName = params.lineDisplayName || ""; // 取出 LINE 顯示名稱
  const message = params.message || ""; // 取出錯誤或補充訊息
  const safeResultType = escapeHtml(resultType); // 將結果類型做 HTML 跳脫
  const safeLineDisplayName = escapeHtml(lineDisplayName); // 將顯示名稱做 HTML 跳脫
  const safeMessage = escapeHtml(message); // 將訊息做 HTML 跳脫

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>LINE 綁定完成</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }
    .wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      width: 100%;
      max-width: 460px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 24px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      padding: 28px;
      box-sizing: border-box;
      text-align: center;
    }
    .title {
      font-size: 28px;
      font-weight: 800;
      margin: 0 0 16px 0;
    }
    .desc {
      font-size: 18px;
      line-height: 1.8;
      color: #475569;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .hint {
      margin-top: 20px;
      font-size: 14px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="title">LINE 綁定處理中</div>
      <p class="desc" id="desc">正在將結果回傳主頁，請稍候...</p>
      <div class="hint">若此視窗未自動關閉，可手動關閉。</div>
    </div>
  </div>

  <script>
    (function () {
      try {
        var payload = {
          source: "line-manager-bind-callback",
          resultType: "${safeResultType}",
          lineDisplayName: "${safeLineDisplayName}",
          message: "${safeMessage}"
        };

        var descText = "正在將結果回傳主頁，請稍候...";
        if (payload.resultType === "success") {
          descText = payload.lineDisplayName
            ? "LINE 帳號（" + payload.lineDisplayName + "）已成功加入協助管理人員。"
            : "LINE 帳號已成功加入協助管理人員。";
        } else if (payload.resultType === "exists") {
          descText = payload.lineDisplayName
            ? "這個 LINE 帳號（" + payload.lineDisplayName + "）已經加入協助管理人員了。"
            : "這個 LINE 帳號已經加入協助管理人員了。";
        } else if (payload.resultType === "error") {
          descText = payload.message || "LINE callback 發生錯誤";
        }

        var descElement = document.getElementById("desc");
        if (descElement) {
          descElement.textContent = descText;
        }

        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
          setTimeout(function () {
            window.close();
          }, 300);
          return;
        }

        setTimeout(function () {
          window.close();
        }, 800);
      } catch (error) {
        console.error("popup callback html error:", error);
      }
    })();
  </script>
</body>
</html>`; // 建立完整 HTML 字串

  return new NextResponse(html, { // 回傳 HTML Response
    status: 200, // 設定狀態碼 200
    headers: { "Content-Type": "text/html; charset=utf-8" }, // 指定 HTML 內容型別
  }); // 回傳結束
} // 函式結束

function buildManagersRedirectUrl(params: { resultType: "success" | "exists" | "error"; lineDisplayName?: string; message?: string }) { // 建立回 /managers 的 redirect 網址
  const resultType = params.resultType; // 取出結果類型
  const lineDisplayName = params.lineDisplayName || ""; // 取出 LINE 顯示名稱
  const message = params.message || ""; // 取出訊息

  if (resultType === "success") { // 若是綁定成功
    return `${APP_BASE_URL}/managers?lineSuccess=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}`; // 回傳成功網址
  } // 判斷結束

  if (resultType === "exists") { // 若是已存在
    return `${APP_BASE_URL}/managers?lineExists=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}`; // 回傳已存在網址
  } // 判斷結束

  return `${APP_BASE_URL}/managers?lineError=${encodeURIComponent(message || "LINE callback 發生錯誤")}`; // 其餘情況回傳錯誤網址
} // 函式結束

function buildLoginRedirectUrl(message: string) { // 建立回 /login 的 redirect 網址
  return `${APP_BASE_URL}/login?lineError=${encodeURIComponent(message)}`; // 回傳 login 錯誤網址
} // 函式結束

export async function GET(request: NextRequest) { // 建立 LINE callback 的 GET API
  try { // 開始錯誤捕捉
    const searchParams = request.nextUrl.searchParams; // 取得網址查詢參數
    const code = searchParams.get("code") || ""; // 取得 LINE 回傳的授權 code
    const state = searchParams.get("state") || ""; // 取得 LINE 回傳的 state
    const error = searchParams.get("error") || ""; // 取得 LINE 回傳的 error
    const errorDescription = searchParams.get("error_description") || ""; // 取得 LINE 回傳的錯誤描述

    let parsedState: any = null; // 先建立 parsedState 變數，避免 state 壞掉時整體直接爆掉

    if (state) { // 若有 state
      try { // 嘗試解析 state
        parsedState = parseLineState(state); // 呼叫既有工具函式解析 state
      } catch (parseError) { // 若 state 解析失敗
        console.error("parseLineState error:", parseError); // 印出解析錯誤
      } // state 解析結束
    } // state 判斷結束

    const vendorId = parsedState?.vendorId || ""; // 從 state 取出 vendorId
    const flow = parsedState?.flow || ""; // 從 state 取出 flow
    const mode = parsedState?.mode || "normal"; // 從 state 取出 mode，預設 normal
    const isPopupMode = mode === "qr"; // 判斷目前是否為桌機 popup / qr 模式

    if (error) { // 若 LINE 回傳錯誤
      const finalMessage = errorDescription || error; // 決定最終錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup 通知主頁並自動關閉
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 否則導回登入頁並帶上錯誤訊息
    } // 錯誤檢查結束

    if (!code || !state) { // 若 callback 缺少必要參數
      const finalMessage = "LINE callback 缺少必要參數"; // 建立錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup HTML
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁並提示缺少參數
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
      const finalMessage = `LINE 環境變數未設定完整：${missingKeys.join("、")}`; // 建立錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup HTML
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁並提示環境變數不完整
    } // 環境變數檢查結束

    if (!vendorId) { // 若 state 裡沒有 vendorId
      const finalMessage = "LINE state 缺少 vendorId"; // 建立錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup HTML
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁
    } // vendorId 檢查結束

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
      const finalMessage = "LINE token 交換失敗"; // 建立錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup HTML
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁
    } // token 檢查結束

    const tokenData = await tokenResponse.json(); // 解析 token JSON
    const accessToken = tokenData.access_token as string; // 取得 access token

    const profileResponse = await fetch("https://api.line.me/v2/profile", { // 使用 access token 取得 LINE 使用者 profile
      headers: { Authorization: `Bearer ${accessToken}` }, // 帶入 Bearer token
    }); // profile 請求結束

    if (!profileResponse.ok) { // 若 profile 取得失敗
      const profileErrorText = await profileResponse.text(); // 讀取錯誤內容文字
      console.error("LINE profile error:", profileErrorText); // 在伺服器端印出 profile 錯誤
      const finalMessage = "LINE profile 取得失敗"; // 建立錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup HTML
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁
    } // profile 檢查結束

    const profileData = await profileResponse.json(); // 解析 profile JSON
    const lineUserId = profileData.userId || ""; // 取得 LINE userId
    const lineDisplayName = profileData.displayName || ""; // 取得 LINE 顯示名稱
    const linePictureUrl = profileData.pictureUrl || ""; // 取得 LINE 頭像網址

    if (!lineUserId) { // 若沒有拿到 lineUserId
      const finalMessage = "LINE userId 取得失敗"; // 建立錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup HTML
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁
    } // userId 檢查結束

    const membersCollectionRef = adminDb.collection("Investors3").doc(vendorId).collection("members"); // 建立 members 子集合參考
    const existingSnapshot = await membersCollectionRef.where("lineUserId", "==", lineUserId).limit(1).get(); // 以 lineUserId 查詢是否已存在相同資料

    if (flow === "manager_bind") { // 若目前流程是新增協助人員綁定
      if (!existingSnapshot.empty) { // 若同一個 LINE 已存在
        if (isPopupMode) { // 若目前是 popup 模式
          return buildPopupCallbackHtml({ resultType: "exists", lineDisplayName }); // 回傳 popup HTML，通知主頁已存在並自動關閉
        } // 判斷結束

        return NextResponse.redirect(buildManagersRedirectUrl({ resultType: "exists", lineDisplayName })); // 手機或同頁模式則導回 managers 並顯示已存在
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

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "success", lineDisplayName }); // 回傳 popup HTML，通知主頁成功並自動關閉
      } // 判斷結束

      return NextResponse.redirect(buildManagersRedirectUrl({ resultType: "success", lineDisplayName })); // 手機或同頁模式則導回 managers 並顯示成功
    } // manager_bind 流程結束

    if (existingSnapshot.empty) { // 若是系統登入流程，但查不到這個 LINE
      const finalMessage = "這個 LINE 尚未加入協助管理人員，請先由主管理者新增。"; // 建立錯誤訊息

      if (isPopupMode) { // 若目前是 popup 模式
        return buildPopupCallbackHtml({ resultType: "error", message: finalMessage }); // 回傳 popup HTML
      } // 判斷結束

      return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁
    } // 查無資料檢查結束

    if (isPopupMode) { // 若是 popup 模式的系統登入流程
      return buildPopupCallbackHtml({ resultType: "success", lineDisplayName }); // 先回傳成功通知主頁並自動關閉
    } // 判斷結束

    return NextResponse.redirect( // 系統登入成功後先導回 managers 頁，後續可再改成 dashboard
      `${APP_BASE_URL}/managers?systemLineLogin=1&lineDisplayName=${encodeURIComponent(lineDisplayName)}` // 組合成功導向網址
    ); // 回傳 redirect
  } catch (callbackError) { // 若 callback 發生任何未預期錯誤
    console.error("LINE callback error:", callbackError); // 在伺服器端印出錯誤
    const finalMessage = "LINE callback 發生錯誤"; // 建立統一錯誤訊息

    return NextResponse.redirect(buildLoginRedirectUrl(finalMessage)); // 導回登入頁並提示 callback 發生錯誤
  } // 錯誤捕捉結束
} // GET API 結束