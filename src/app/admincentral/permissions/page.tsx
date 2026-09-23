"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { useCached } from "@/lib/dashboard/client";
import type { PlatformPermission } from "@/components/platform/data";

// Matriz de permissões da PLATAFORMA por papel (Owner/Admin). Somente
// leitura: a atribuição é definida pelas migrações (platform_role_permissions).
const ROLES = ["OWNER", "ADMIN"] as const;
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = { OWNER: "Owner", ADMIN: "Admin" };

export default function PlatformPermissionsPage() {
  const res = useCached<PlatformPermission[]>("/api/platform/permissions");
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, PlatformPermission[]>();
    for (const p of res.data ?? []) {
      if (q && !`${p.code} ${p.description ?? ""}`.toLowerCase().includes(q)) continue;
      map.set(p.area, [...(map.get(p.area) ?? []), p]);
    }
    return [...map.entries()];
  }, [res.data, query]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Permissões da plataforma" description="O que cada papel da Administração Central pode fazer. Estas permissões não valem dentro das empresas." />
      <Panel className="overflow-hidden">
        <div className="border-b border-border p-3">
          <div className="relative max-w-xs">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle-foreground" aria-hidden />
            <Input aria-label="Filtrar permissões" placeholder="Filtrar permissões..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>
        </div>
        {res.loading ? (
          <SkeletonRows rows={6} />
        ) : res.error ? (
          <EmptyState compact kind="error" title="Permissões indisponíveis" description={res.error} onRetry={res.reload} />
        ) : groups.length === 0 ? (
          <EmptyState compact kind={query ? "no-results" : "empty"} title={query ? "Nenhuma permissão encontrada" : "Catálogo vazio"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th scope="col" className="h-8 px-4 text-left">Permissão</th>
                  {ROLES.map((r) => (
                    <th key={r} scope="col" className="h-8 w-24 px-4 text-center">{ROLE_LABEL[r]}</th>
                  ))}
                </tr>
              </thead>
              {groups.map(([area, perms]) => (
                <tbody key={area}>
                  <tr className="border-b border-border bg-surface-muted/60">
                    <th scope="rowgroup" colSpan={ROLES.length + 1} className="px-4 py-1.5 text-left text-xs font-semibold capitalize">{area.replace(/_/g, " ")}</th>
                  </tr>
                  {perms.map((p) => (
                    <tr key={p.code} className="h-10 border-b border-border last:border-0 hover:bg-surface-hover">
                      <th scope="row" className="px-4 text-left font-normal">
                        <span className="flex items-center gap-2">
                          {p.description ?? p.code}
                          {p.owner_only && <Badge tone="critical">Só Owner</Badge>}
                        </span>
                        <span className="code block text-2xs text-subtle-foreground">{p.code}</span>
                      </th>
                      {ROLES.map((r) => (
                        <td key={r} className="text-center">
                          {p.roles.includes(r) ? <Check size={15} className="mx-auto text-success-fg" aria-label="Permitido" /> : <Minus size={15} className="mx-auto text-subtle-foreground" aria-label="Não permitido" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
