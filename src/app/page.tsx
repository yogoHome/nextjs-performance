import Link from "next/link";

const quickLinks = [
  {
    href: "/cases",
    title: "案件管理",
    description: "管理 Investors1 的案件新增、修改、刪除與查詢。",
  },
  {
    href: "/deals",
    title: "成交案件",
    description: "管理 Investors4 的成交案件與成交參考資料。",
  },
  {
    href: "/agents",
    title: "業務邀請",
    description: "管理 Investors2 業務資料與各廠商邀請權限。",
  },
  {
    href: "/managers",
    title: "管理人員",
    description: "管理 Investors3 members 子集合與 LINE 綁定。",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-full p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <p className="text-sm font-medium text-blue-600">Performance 後台</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">投資客案件管理系統</h1>
          <p className="mt-3 text-sm leading-7 text-gray-600 md:text-base">
            目前已切換成你指定的版型：桌機版使用左側直式導覽，手機版使用底部四按鈕導覽列。
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="text-xl font-semibold">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-gray-600">{item.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
