import { NextRequest, NextResponse } from "next/server"; // 匯入 Next.js request 與 response 物件
import { adminDb } from "../../../../../lib/firebase-admin"; // 匯入 Firebase Admin Firestore

const BOOTSTRAP_VENDOR_ID = process.env.BOOTSTRAP_VENDOR_ID || ""; // 從環境變數讀取要使用的廠商文件 ID

function convertTimestampToText(value: any): string { // 將 Firestore timestamp 轉成可顯示文字
  try { // 開始錯誤捕捉
    if (!value) return ""; // 若沒有值直接回傳空字串
    if (typeof value?.toDate === "function") { // 若是 Firestore Timestamp
      return value.toDate().toLocaleString("zh-TW", { hour12: false }); // 轉為台灣時間字串
    } // 判斷結束
    if (value instanceof Date) { // 若已經是 Date 物件
      return value.toLocaleString("zh-TW", { hour12: false }); // 直接格式化
    } // 判斷結束
    if (typeof value === "string") { // 若本身就是字串
      return value; // 直接回傳
    } // 判斷結束
    return ""; // 其餘情況回傳空字串
  } catch { // 若轉換失敗
    return ""; // 回傳空字串，避免整體爆掉
  } // 錯誤捕捉結束
} // 函式結束

export async function GET(request: NextRequest) { // 建立 managers list 的 GET API
  try { // 開始錯誤捕捉
    const vendorId = request.nextUrl.searchParams.get("vendorId") || BOOTSTRAP_VENDOR_ID; // 優先使用 query 參數，沒有就用環境變數

    if (!vendorId) { // 若 vendorId 仍然不存在
      return NextResponse.json( // 回傳錯誤 JSON
        {
          ok: false, // 失敗旗標
          error: "缺少 BOOTSTRAP_VENDOR_ID，無法讀取協助人員資料。", // 錯誤訊息
        },
        { status: 400 }, // 狀態碼 400
      ); // 回傳結束
    } // 檢查結束

    const vendorDocRef = adminDb.collection("Investors3").doc(vendorId); // 建立 Investors3/{vendorId} 文件參考
    const vendorDocSnapshot = await vendorDocRef.get(); // 讀取主文件

    if (!vendorDocSnapshot.exists) { // 若主文件不存在
      return NextResponse.json( // 回傳成功但附帶 notFoundVendor，讓前端顯示找不到廠商文件
        {
          ok: true, // 成功旗標
          vendorId, // 回傳目前查詢的 vendorId
          notFoundVendor: true, // 標記找不到廠商文件
          members: [], // members 為空陣列
        },
        { status: 200 }, // 狀態碼 200
      ); // 回傳結束
    } // 判斷結束

    const membersSnapshot = await vendorDocRef // 從對應廠商文件底下讀取 members 子集合
      .collection("members") // 指定 members 子集合
      .orderBy("createdAt", "desc") // 依建立時間新到舊排序
      .get(); // 執行查詢

    const members = membersSnapshot.docs.map((doc) => { // 將查詢結果整理成前端需要的格式
      const data = doc.data() || {}; // 取出文件資料
      return { // 回傳整理後物件
        id: doc.id, // 文件 ID
        memberId: data.memberId || doc.id, // memberId
        vendorId: data.vendorId || vendorId, // vendorId
        email: data.email || "", // Email
        firebaseUid: data.firebaseUid || "", // firebaseUid
        name: data.name || "", // 名稱
        role: data.role || "manager", // 角色
        status: data.status || "", // 狀態
        lineUserId: data.lineUserId || "", // LINE userId
        lineDisplayName: data.lineDisplayName || "", // LINE 顯示名稱
        linePictureUrl: data.linePictureUrl || "", // LINE 頭像網址
        lineBound: Boolean(data.lineBound), // 是否已綁定 LINE
        bindStatus: data.bindStatus || "", // 綁定狀態
        allowManageInvestors1: Boolean(data.allowManageInvestors1), // 是否可管理案件
        allowManageDeals: Boolean(data.allowManageDeals), // 是否可管理成交案件
        allowManageAgents: Boolean(data.allowManageAgents), // 是否可管理業務
        allowManageManagers: Boolean(data.allowManageManagers), // 是否可管理協助人員
        createdAt: convertTimestampToText(data.createdAt), // 建立時間文字
        updatedAt: convertTimestampToText(data.updatedAt), // 更新時間文字
      }; // 單筆整理結束
    }); // map 結束

    return NextResponse.json( // 回傳成功 JSON
      {
        ok: true, // 成功旗標
        vendorId, // 回傳實際使用的 vendorId
        notFoundVendor: false, // 標記廠商文件存在
        members, // 回傳協助人員名單
      },
      { status: 200 }, // 狀態碼 200
    ); // 回傳結束
  } catch (error: any) { // 捕捉未預期錯誤
    console.error("vendor managers list error:", error); // 在伺服器印出錯誤
    return NextResponse.json( // 回傳錯誤 JSON
      {
        ok: false, // 失敗旗標
        error: error?.message || "讀取協助人員名單失敗", // 錯誤訊息
      },
      { status: 500 }, // 狀態碼 500
    ); // 回傳結束
  } // 錯誤捕捉結束
} // GET API 結束