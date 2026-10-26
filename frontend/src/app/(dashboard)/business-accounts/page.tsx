"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BusinessAccountsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/business");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-slate-400">
      Redirecting to Businesses directory...
    </div>
  );
}
