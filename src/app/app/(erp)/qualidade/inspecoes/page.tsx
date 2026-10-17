"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateTimeCol, statusCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { QualityInspectionRow } from "@/lib/database/schema";

export default function InspecoesPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/quality-inspections");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<QualityInspectionRow>
      title="Inspeções de qualidade"
      description="Inspeções de recebimento, produção, expedição, ativo ou manutenção."
      apiPath="/api/quality-inspections"
      refreshToken={refresh}
      actions={
        can("quality_inspections.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova inspeção
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar inspeção..."
      columns={[
        codeCol<QualityInspectionRow>("code", "Inspeção"),
        textCol<QualityInspectionRow>("inspection_type", "Tipo", { mobile: "meta" }),
        textCol<QualityInspectionRow>("source_type", "Origem"),
        dateTimeCol<QualityInspectionRow>("inspected_at", "Inspecionada em", { mobile: "meta" }),
        statusCol<QualityInspectionRow>("quality_inspections"),
      ]}
      filters={[
        statusViews<QualityInspectionRow>([{ value: "pendentes", label: "Pendentes", statuses: ["PENDING", "IN_PROGRESS"] }, { value: "reprovadas", label: "Reprovadas", statuses: ["REJECTED"] }]),
        statusFilter<QualityInspectionRow>("quality_inspections", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="quality_inspections" status={row.status} />,
      }}
      emptyDescription="Crie o primeiro pelo botão Nova inspeção."
    />
    <SimpleCreateDialog form="qualityInspections" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
