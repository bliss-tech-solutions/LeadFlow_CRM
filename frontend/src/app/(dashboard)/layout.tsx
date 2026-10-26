"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import RealtimeToast from "../../components/Toast";
import { NavProvider } from "../../lib/nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("leadflow_token")) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">
        Loading workspace...
      </div>
    );
  }

  return (
    <NavProvider>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50">
        {/* Responsive Sidebar (Slide-over drawer on < md, static fixed on >= md) */}
        <Sidebar />

        {/* Main Content Area (takes remaining width, naturally scrolls vertically) */}
        <main className="flex-1 h-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 sm:px-5 sm:py-5 md:px-7 md:py-7 lg:px-9">
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </main>

        <RealtimeToast />
      </div>
    </NavProvider>
  );
}
