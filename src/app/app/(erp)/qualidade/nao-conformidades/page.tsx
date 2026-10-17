"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, statusFilter, enumFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { NonconformityRow } from "@/lib/database/schema";

export default function NaoConformidadesPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/nonconformities");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<NonconformityRow>
      title="Não conformidades"
      description="Desvios identificados em inspeções ou abertos diretamente, da análise ao tratamento."
      apiPath="/api/nonconformities"
      refreshToken={refresh}
      actions={
        can("nonconformities.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova não conformidade
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar NC ou descrição..."
      columns={[
        codeCol<NonconformityRow>("code", "NC"),
        textCol<NonconformityRow>("description", "Descrição", { mobile: "meta" }),
        statusCol<NonconformityRow>(undefined, "severity", "Severidade", { width: "7rem", mobile: "meta" }),
        dateCol<NonconformityRow>("opened_at", "Aberta em"),
        statusCol<NonconformityRow>("nonconformities"),
      ]}
      filters={[
        statusViews<NonconformityRow>([
          { value: "abertas", label: "Em aberto", statuses: ["OPEN", "IN_ANALYSIS", "IN_TREATMENT"] },
          { value: "criticas", label: "Abertas (sem análise)", statuses: ["OPEN"] },
        ]),
        statusFilter<NonconformityRow>("nonconformities", "status", { server: true }),
        enumFilter<NonconformityRow>("severity", "Severidade", [["LOW", "Baixa"], ["MEDIUM", "Média"], ["HIGH", "Alta"], ["CRITICAL", "Crítica"]]),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.description,
        badges: (row) => <StatusBadge entity="nonconformities" status={row.status} />,
      }}
      emptyDescription="Crie o primeiro pelo botão Nova não conformidade."
    />
    <SimpleCreateDialog form="nonconformities" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
