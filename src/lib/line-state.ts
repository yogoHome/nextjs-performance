export type LineFlow = "manager_bind" | "system_login"; // 定義 LINE 流程型別，分成協助人員綁定與系統登入兩種

export function createLineState(vendorId: string, flow: LineFlow) { // 建立 LINE state 字串的工具函式
  const nonce = crypto.randomUUID(); // 產生隨機 nonce，避免重複請求或被重放
  const payload = { vendorId, flow, nonce }; // 組合要帶去 callback 的資料
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"); // 轉成 base64url 字串後回傳
} // 函式結束

export function parseLineState(state: string) { // 解析 LINE callback 回來的 state 字串
  const text = Buffer.from(state, "base64url").toString("utf8"); // 把 base64url 還原成一般文字
  return JSON.parse(text) as { vendorId: string; flow: LineFlow; nonce: string }; // 轉成物件後回傳
} // 函式結束