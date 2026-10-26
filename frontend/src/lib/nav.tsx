"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type NavContextType = {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const NavContext = createContext<NavContextType>({
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Automatically close mobile menu on page transition
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <NavContext.Provider value={{ mobileOpen, setMobileOpen }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  return useContext(NavContext);
}

