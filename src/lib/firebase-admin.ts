import { cert, getApps, initializeApp } from "firebase-admin/app"; // 匯入 Firebase Admin 初始化需要的方法
import { getFirestore } from "firebase-admin/firestore"; // 匯入 Firebase Admin 的 Firestore 方法

const projectId = process.env.FIREBASE_PROJECT_ID; // 讀取 Firebase 專案 ID 環境變數
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL; // 讀取 Firebase Admin client email 環境變數
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"); // 將 .env.local 裡的 \n 還原成真正換行

if (!projectId || !clientEmail || !privateKey) { // 若必要環境變數缺少
  throw new Error("Firebase Admin 環境變數未設定完整"); // 丟出錯誤停止執行
} // 環境變數檢查結束

const adminApp = getApps().length // 若已經初始化過 Firebase Admin
  ? getApps()[0]! // 直接使用第一個已存在的 app
  : initializeApp({ // 否則就初始化一個新的 Firebase Admin app
      credential: cert({ // 使用 service account 憑證
        projectId, // 專案 ID
        clientEmail, // client email
        privateKey, // private key
      }), // 憑證設定結束
    }); // Firebase Admin 初始化結束

export const adminDb = getFirestore(adminApp); // 匯出 Admin Firestore 實例