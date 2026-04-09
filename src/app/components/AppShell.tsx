"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  desktopLabel: string;
  mobileLabel: string;
};

const navItems: NavItem[] = [
  { href: "/cases", desktopLabel: "案件管理", mobileLabel: "案件" },
  { href: "/deals", desktopLabel: "成交案件", mobileLabel: "成交" },
  { href: "/agents", desktopLabel: "業務邀請", mobileLabel: "業務" },
  { href: "/managers", desktopLabel: "管理人員", mobileLabel: "管理" },
];

function isItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-72 shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col">
          <div className="border-b border-gray-200 px-6 py-6">
            <Link href="/" className="block">
              <p className="text-sm font-medium text-blue-600">Performance 後台</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight">投資客案件管理</h1>
              <p className="mt-2 text-sm text-gray-500">桌機版左側導覽列</p>
            </Link>
          </div>

          <nav className="flex-1 space-y-2 px-4 py-6">
            {navItems.map((item) => {
              const active = isItemActive(pathname, item.href);
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

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="border-b border-gray-200 bg-white px-4 py-4 md:hidden">
            <Link href="/" className="block">
              <p className="text-xs font-medium text-blue-600">Performance 後台</p>
              <p className="mt-1 text-lg font-bold">投資客案件管理</p>
            </Link>
          </header>

          <main className="flex-1 pb-24 md:pb-0">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)] md:hidden">
        <div className="grid grid-cols-4">
          {navItems.map((item) => {
            const active = isItemActive(pathname, item.href);
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
  );
}
