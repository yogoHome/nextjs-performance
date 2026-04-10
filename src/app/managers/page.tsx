import { Suspense } from "react";
import ManagersPageClient from "./ManagersPageClient";

export default function ManagersPage() {
  return (
    <Suspense
      fallback={
        <main className="p-4 md:p-6">
          <div className="max-w-none rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            讀取中...
          </div>
        </main>
      }
    >
      <ManagersPageClient />
    </Suspense>
  );
}