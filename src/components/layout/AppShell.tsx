"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { hydrateAllCadastros } from "@/lib/cadastros/repository";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    hydrateAllCadastros();
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-h-screen w-full flex-1 flex-col lg:min-w-0">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main key={pathname} className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="animate-fade-in-up mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
