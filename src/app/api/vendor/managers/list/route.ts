import { NextRequest, NextResponse } from "next/server"; // 匯入 Next.js request 與 response 物件
import { adminDb } from "../../../../../lib/firebase-admin"; // 匯入 Firebase Admin Firestore

const DEFAULT_VENDOR_ID = process.env.DEFAULT_VENDOR_ID || "vendor-test-001"; // 預設備援 vendorId，若之後你已有正式廠商代號可改成自己的值

function convertTimestampToText(value: any): string { // 將 Firestore timestamp 轉成可顯示文字
  try { // 開始錯誤捕捉
    if (!value) return ""; // 若沒有值直接回傳空字串
    if (typeof value?.toDate === "function") { // 若是 Firestore Timestamp
      return value.toDate().toLocaleString("zh-TW", { hour12: false }); // 轉成本地時間字串
    } // 判斷結束
    if (value instanceof Date) { // 若本身已經是 Date 物件
      return value.toLocaleString("zh-TW", { hour12: false }); // 直接格式化
    } // 判斷結束
    if (typeof value === "string") { // 若本身就是字串
      return value; // 直接回傳
    } // 判斷結束
    return ""; // 其餘情況回傳空字串
  } catch { // 若轉換失敗
    return ""; // 回傳空字串避免整體爆掉
  } // 錯誤捕捉結束
} // 函式結束

export async function GET(request: NextRequest) { // 建立 managers list 的 GET API
  try { // 開始錯誤捕捉
    const vendorId = request.nextUrl.searchParams.get("vendorId") || DEFAULT_VENDOR_ID; // 先從 query 取 vendorId，若沒有就用預設值

    if (!vendorId) { // 若 vendorId 仍然不存在
      return NextResponse.json( // 回傳錯誤 JSON
        { ok: false, error: "缺少 vendorId，且 DEFAULT_VENDOR_ID 也未設定。" }, // 錯誤內容
        { status: 400 } // 狀態碼 400
      ); // 回傳結束
    } // 檢查結束

    const membersSnapshot = await adminDb // 從 Firestore 讀取 Investors3/{vendorId}/members
      .collection("Investors3") // 指定主集合
      .doc(vendorId) // 指定廠商文件
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
        vendorId, // 回傳這次實際使用的 vendorId
        members, // 回傳成員陣列
      },
      { status: 200 } // 狀態碼 200
    ); // 回傳結束
  } catch (error: any) { // 捕捉未預期錯誤
    console.error("vendor managers list error:", error); // 在伺服器印錯誤
    return NextResponse.json( // 回傳錯誤 JSON
      {
        ok: false, // 失敗旗標
        error: error?.message || "讀取協助人員名單失敗", // 錯誤訊息
      },
      { status: 500 } // 狀態碼 500
    ); // 回傳結束
  } // 錯誤捕捉結束
} // GET API 結束