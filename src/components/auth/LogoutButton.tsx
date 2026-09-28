"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clearClientSessionState } from "@/lib/session/client-state";
import { submitForm } from "@/lib/session/submit-form";

// Sair: limpa o estado local do usuário (unidade em foco, caches) e envia
// o POST que encerra a sessão no servidor (/api/auth/logout → /login).

/**
 * Sair a partir de um item de MENU (Radix DropdownMenu).
 *
 * Um <button type="submit"> dentro do conteúdo do menu não serve: no clique
 * do mouse o Radix fecha o menu ainda durante o evento, o conteúdo (e o
 * <form> dentro dele) é desmontado antes da ação padrão do clique, e o
 * navegador descarta o envio — a sessão continuava ativa. Aqui o <form> fica
 * FORA do conteúdo do menu (renderize `form` ao lado do DropdownMenu) e o
 * item chama `logout` no onSelect, que o Radix dispara igual para mouse,
 * toque e teclado. O envio é síncrono (requestSubmit), sem temporizador.
 */
export function useLogout() {
  const formRef = useRef<HTMLFormElement>(null);
  const logout = useCallback(() => {
    clearClientSessionState();
    submitForm(formRef.current);
  }, []);
  const form = <form ref={formRef} action="/api/auth/logout" method="post" hidden aria-hidden="true" data-logout-form="" />;
  return { logout, form };
}

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
