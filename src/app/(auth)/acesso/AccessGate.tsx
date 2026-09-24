"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { AccessStateCard } from "@/components/auth/AccessStateCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { postLoginDestination } from "@/lib/onboarding/access";
import { primeSession } from "@/lib/session/client-state";
import type { AccessState, SessionContext } from "@/lib/session/types";

// Destino de quem entrou mas ainda não tem contexto para operar. Se o
// contexto existir (ex.: o administrador acabou de liberar), segue para
// o ambiente certo; senão, explica — sem detalhe técnico.
export function AccessGate() {
  const router = useRouter();
  const [state, setState] = useState<{ access: Exclude<AccessState, "active">; email: string | null } | "loading" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session/context", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.success) {
          setState("error");
          return;
        }
        const ctx = body.data as SessionContext;
        const destination = postLoginDestination(ctx);
        if (destination !== "/acesso") {
          primeSession(ctx);
          router.replace(destination);
          return;
        }
        setState({ access: ctx.access === "active" ? "no_company" : ctx.access, email: ctx.authUser.email });
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  return (
    <AuthFrame>
      {state === "loading" ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando acesso">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : state === "error" ? (
        <div className="flex flex-col gap-4">
          <Alert tone="danger" title="Não foi possível verificar seu acesso">
            Tente novamente em instantes.
          </Alert>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>
              Tentar novamente
            </Button>
            <LogoutButton />
          </div>
        </div>
      ) : (
        <AccessStateCard state={state.access} email={state.email} />
      )}
    </AuthFrame>
  );
}
