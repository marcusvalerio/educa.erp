"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clearClientSessionState } from "@/lib/session/client-state";

// Sair: limpa o estado local do usuário (unidade em foco, caches) e envia
// o POST que encerra a sessão no servidor (/api/auth/logout → /login).
export function LogoutForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form action="/api/auth/logout" method="post" className={className} onSubmit={() => clearClientSessionState()}>
      {children}
    </form>
  );
}

export function LogoutButton({ variant = "ghost", label = "Sair" }: { variant?: "ghost" | "secondary"; label?: string }) {
  return (
    <LogoutForm>
      <Button type="submit" variant={variant} size="sm">
        <LogOut size={14} aria-hidden /> {label}
      </Button>
    </LogoutForm>
  );
}
