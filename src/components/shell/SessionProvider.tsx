"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SessionContext } from "@/lib/session/types";
import { takePrimedSession } from "@/lib/session/client-state";

// Contexto da sessão no cliente (quem é, empresa, unidades, papéis,
// permissões efetivas, módulos, papel de plataforma).
//
// Tudo aqui é DESCRITIVO: esconder menu/ações é conveniência de UX. A
// barreira real é a API + RLS. O seletor de unidade só escolhe ENTRE as
// unidades que o próprio banco já devolveu como acessíveis — nunca amplia
// acesso.

type Status = "loading" | "ready" | "unauthenticated" | "error";

type SessionValue = {
  status: Status;
  data: SessionContext | null;
  error: string | null;
  reload: () => void;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canPlatform: (permission: string) => boolean;
  hasModule: (moduleCode: string) => boolean;
  /** Unidade em foco (null = todas as unidades acessíveis). */
  branchId: string | null;
  /** Primeiro acesso com mais de uma unidade e nenhuma escolha feita ainda. */
  branchPending: boolean;
  setBranchId: (branchId: string | null) => void;
};

const SessionCtx = createContext<SessionValue | null>(null);

const BRANCH_KEY_PREFIX = "educa-branch:";

function readStoredBranch(userId: string): string | null | undefined {
  try {
    const raw = window.localStorage.getItem(BRANCH_KEY_PREFIX + userId);
    if (raw === null) return undefined;
    return raw === "all" ? null : raw;
  } catch {
    return undefined;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<SessionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [branchChoice, setBranchChoice] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Resposta que o login acabou de buscar (mesma sessão, segundos atrás).
      const primed = reloadKey === 0 ? takePrimedSession() : null;
      if (primed) {
        setData(primed);
        setError(null);
        setStatus("ready");
        if (primed.tenant) setBranchChoice(readStoredBranch(primed.tenant.user.id));
        return;
      }
      try {
        const res = await fetch("/api/session/context", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.status === 401) {
          setStatus("unauthenticated");
          setData(null);
          return;
        }
        if (!res.ok || !body?.success) {
          setError(body?.error?.message ?? `Não foi possível carregar sua sessão (erro ${res.status}).`);
          setStatus("error");
          return;
        }
        const session = body.data as SessionContext;
        setData(session);
        setError(null);
        setStatus("ready");
        if (session.tenant) setBranchChoice(readStoredBranch(session.tenant.user.id));
      } catch {
        if (!cancelled) {
          setError("Não foi possível conectar ao servidor.");
          setStatus("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const permissionSet = useMemo(() => new Set(data?.tenant?.permissions ?? []), [data]);
  const moduleSet = useMemo(() => new Set(data?.tenant?.modules ?? []), [data]);
  const platformSet = useMemo(() => new Set(data?.platform?.permissions ?? []), [data]);

  const can = useCallback((permission: string) => permissionSet.has(permission), [permissionSet]);
  const canAny = useCallback((permissions: string[]) => permissions.some((p) => permissionSet.has(p)), [permissionSet]);
  const canPlatform = useCallback((permission: string) => platformSet.has(permission), [platformSet]);
  const hasModule = useCallback((code: string) => moduleSet.has(code), [moduleSet]);

  // Unidade efetiva: escolha salva (se ainda acessível) -> unidade
  // principal do usuário (se acessível) -> todas.
  const branchId = useMemo(() => {
    const branches = data?.tenant?.branches ?? [];
    const valid = (id: string | null | undefined) => (id ? branches.some((b) => b.id === id) : false);
    if (branchChoice === null) return null;
    if (valid(branchChoice)) return branchChoice as string;
    if (branches.length === 1) return branches[0].id;
    if (valid(data?.tenant?.branch?.id)) return data?.tenant?.branch?.id ?? null;
    return null;
  }, [branchChoice, data]);

  const branchPending = status === "ready" && (data?.tenant?.branches.length ?? 0) > 1 && branchChoice === undefined;

  const setBranchId = useCallback(
    (next: string | null) => {
      setBranchChoice(next);
      const userId = data?.tenant?.user.id;
      if (!userId) return;
      try {
        window.localStorage.setItem(BRANCH_KEY_PREFIX + userId, next ?? "all");
      } catch {
        // Preferência de exibição; sem persistência, vale só nesta sessão.
      }
    },
    [data]
  );

  const reload = useCallback(() => {
    setStatus("loading");
    setReloadKey((n) => n + 1);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, data, error, reload, can, canAny, canPlatform, hasModule, branchId, branchPending, setBranchId }),
    [status, data, error, reload, can, canAny, canPlatform, hasModule, branchId, branchPending, setBranchId]
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession precisa estar dentro de <SessionProvider>.");
  return ctx;
}

/** Atalho para gates de ação: `const canCreate = usePermission("sales_orders.create")`. */
export function usePermission(permission: string): boolean {
  return useSession().can(permission);
}
