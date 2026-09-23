"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/Feedback";
import { useSession } from "@/components/shell/SessionProvider";
import { AREAS, type AreaId } from "@/components/dashboard/AreaDashboard";
import { ERP_NAV } from "@/lib/nav";
import { canAccess } from "@/lib/navigation/access";

// Hub de relatórios: somente os painéis que o perfil pode abrir. Cada
// painel lê as funções de relatório reais (fn_report_*, controladoria).
export default function RelatoriosPage() {
  const { can } = useSession();
  const items = (ERP_NAV.find((s) => s.id === "dashboards")?.items ?? []).filter((item) => canAccess(item.permission, can));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Relatórios" description="Painéis gerenciais por área, com período selecionável e comparação com o período anterior." />
      {items.length === 0 ? (
        <EmptyState kind="no-permission" title="Nenhum relatório disponível" description="O seu perfil ainda não tem acesso a relatórios gerenciais." />
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const id = (item.href.split("/")[3] ?? "executivo") as AreaId;
            const area = AREAS[id];
            return (
              <li key={item.href} className="bg-surface">
                <Link href={item.href} className="group flex h-full flex-col gap-1 p-4 hover:bg-surface-hover">
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {area?.title ?? item.label}
                    <ArrowRight size={14} className="text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  {area && <span className="text-xs text-muted-foreground">{area.description}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
