"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert, Undo2 } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import RealtimeToast from "../../components/Toast";
import { NavProvider } from "../../lib/nav";
import { getUser, saveSession } from "../../lib/auth";
import { canAccessPath, homeForRole } from "../../lib/access";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("leadflow_token")) {
      router.replace("/login");
      return;
    }
    const user = getUser();
    const ok = canAccessPath(user?.role, pathname || "/");
    setAllowed(ok);
    if (!ok) router.replace(homeForRole(user?.role));
    setImpersonating(localStorage.getItem("leadflow_impersonator") ? user?.name || "user" : null);
    setReady(true);
  }, [router, pathname]);

  // Keep-alive ping so free hosting tiers do not cold-start mid-session.
  useEffect(() => {
    if (!ready) return;
    const ping = () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      fetch(`${apiUrl.replace(/\/api\/?$/, "")}/health`, { cache: "no-store" }).catch(() => {});
    };
    const interval = setInterval(ping, 9 * 60 * 1000);
    return () => clearInterval(interval);
  }, [ready]);

  function stopImpersonating() {
    try {
      const saved = JSON.parse(localStorage.getItem("leadflow_impersonator") || "null");
      localStorage.removeItem("leadflow_impersonator");
      if (saved?.token && saved?.user) {
        saveSession(saved.token, saved.user);
        window.location.replace("/team");
        return;
      }
    } catch {}
    window.location.replace("/login");
  }

  if (!ready || !allowed) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading workspace...</div>;
  }

  return (
    <NavProvider>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50">
        <Sidebar />
        <main className="h-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 lg:px-8">
          {impersonating && (
            <div className="mx-auto mb-4 flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              <span className="inline-flex items-center gap-2">
                <ShieldAlert size={15} /> You are viewing the CRM as <b>{impersonating}</b>. Actions are recorded in the audit log.
              </span>
              <button onClick={stopImpersonating} className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700">
                <Undo2 size={13} /> Return to admin
              </button>
            </div>
          )}
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </main>
        <RealtimeToast />
      </div>
    </NavProvider>
  );
}
