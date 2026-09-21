"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import RealtimeToast from "../../components/Toast";

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
    <div className="h-screen w-full overflow-hidden bg-slate-50">
      {/* Fixed Left Sidebar */}
      <Sidebar />

      {/* Scrollable Content Area */}
      <main
        className="
          fixed inset-y-0 right-0
          left-[68px]
          h-screen
          overflow-x-hidden
          overflow-y-auto
          overscroll-contain
          px-3 py-4
          sm:px-5
          md:left-60
          md:px-7 md:py-7
          lg:px-9
        "
      >
        <div className="mx-auto w-full max-w-[1800px]">{children}</div>
      </main>

      <RealtimeToast />
    </div>
  );
}
