import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Performance 後台</h1>
        <p className="text-gray-600 mb-8">
          投資客案件管理系統第一版主功能入口
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/cases"
            className="rounded-2xl bg-white shadow p-6 border hover:shadow-md"
          >
            <h2 className="text-xl font-semibold mb-2">案件管理</h2>
            <p className="text-gray-600">
              管理 Investors1 的案件新增、修改、刪除、查詢
            </p>
          </Link>

          <Link
            href="/deals"
            className="rounded-2xl bg-white shadow p-6 border hover:shadow-md"
          >
            <h2 className="text-xl font-semibold mb-2">成交案件管理</h2>
            <p className="text-gray-600">
              管理 Investors4 的成交案件與成交參考資料
            </p>
          </Link>

          <Link
            href="/agents"
            className="rounded-2xl bg-white shadow p-6 border hover:shadow-md"
          >
            <h2 className="text-xl font-semibold mb-2">業務管理</h2>
            <p className="text-gray-600">
              管理 Investors2 業務資料與各廠商權限
            </p>
          </Link>

          <Link
            href="/managers"
            className="rounded-2xl bg-white shadow p-6 border hover:shadow-md"
          >
            <h2 className="text-xl font-semibold mb-2">協助人員管理</h2>
            <p className="text-gray-600">
              管理 Investors3 的 members 子集合與 LINE 綁定
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}