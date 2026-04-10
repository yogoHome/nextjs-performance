"use client"; // 這個元件在瀏覽器端執行，因為要使用目前路徑 hook

import Link from "next/link"; // 匯入 Next.js 的 Link 元件
import { usePathname } from "next/navigation"; // 匯入目前路徑 hook
import type { ReactNode } from "react"; // 匯入 ReactNode 型別

type NavItem = { // 定義導覽項目型別
  href: string; // 導頁路徑
  desktopLabel: string; // 桌機版文字
  mobileLabel: string; // 手機版文字
}; // 型別結束

const navItems: NavItem[] = [ // 定義導覽列資料
  { href: "/cases", desktopLabel: "案件管理", mobileLabel: "案件" }, // 案件管理
  { href: "/deals", desktopLabel: "成交案件", mobileLabel: "成交" }, // 成交案件
  { href: "/agents", desktopLabel: "業務邀請", mobileLabel: "業務" }, // 業務邀請
  { href: "/managers", desktopLabel: "管理人員", mobileLabel: "管理" }, // 管理人員
]; // 導覽資料結束

function isItemActive(pathname: string, href: string) { // 判斷導覽項目是否為目前頁面
  if (href === "/") return pathname === "/"; // 若是首頁則需完全相同
  return pathname === href || pathname.startsWith(`${href}/`); // 其他頁面支援子路徑高亮
} // 函式結束

export default function AppShell({ children }: { children: ReactNode }) { // 建立後台共用版型元件
  const pathname = usePathname(); // 取得目前網址路徑
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/"); // 判斷是否為登入頁

  if (isLoginPage) { // 若是登入頁
    return <>{children}</>; // 直接回傳內容，不套後台導覽版型
  } // 判斷結束

  return ( // 回傳畫面開始
    <div className="min-h-screen bg-gray-50 text-gray-900"> {/* 最外層背景容器 */}
      <div className="flex min-h-screen w-full"> {/* 整個後台主框架 */}
        <aside className="hidden w-[220px] shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col"> {/* 桌機左側欄 */}
          <div className="border-b border-gray-200 px-5 py-6"> {/* 左上品牌區塊 */}
            <Link href="/" className="block"> {/* 品牌返回首頁連結 */}
              <p className="text-sm font-medium text-blue-600">Performance 後台</p> {/* 小標題 */}
              <h1 className="mt-2 text-2xl font-bold tracking-tight">投資客案件管理</h1> {/* 主標題 */}
              <p className="mt-2 text-sm text-gray-500">桌機版左側導覽列</p> {/* 說明文字 */}
            </Link>
          </div>

          <nav className="flex-1 space-y-2 px-3 py-6"> {/* 左側選單區塊 */}
            {navItems.map((item) => { // 逐筆產生選單按鈕
              const active = isItemActive(pathname, item.href); // 判斷目前是否作用中

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center rounded-2xl border px-4 py-4 text-base font-semibold transition",
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-transparent bg-white text-gray-700 hover:border-gray-200 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {item.desktopLabel}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col"> {/* 右側主內容區 */}
          <header className="border-b border-gray-200 bg-white px-4 py-4 md:hidden"> {/* 手機版上方標題列 */}
            <Link href="/" className="block">
              <p className="text-xs font-medium text-blue-600">Performance 後台</p>
              <p className="mt-1 text-lg font-bold">投資客案件管理</p>
            </Link>
          </header>

          <main className="flex-1 pb-24 md:pb-0"> {/* 手機底部留空間 */}
            {children}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden"> {/* 手機底部導覽列 */}
        <div className="grid grid-cols-4">
          {navItems.map((item) => { // 逐筆產生手機底部按鈕
            const active = isItemActive(pathname, item.href); // 判斷目前頁面是否作用中

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex min-h-[64px] flex-col items-center justify-center px-2 text-xs font-semibold transition",
                  active ? "text-blue-600" : "text-gray-500",
                ].join(" ")}
              >
                <span>{item.mobileLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  ); // 回傳畫面結束
} // 元件結束