"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { PickListRow } from "@/lib/database/schema";

export default function PickingPage() {
  return (
    <ResourceListPage<PickListRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Picking"
      title="Separação (picking)"
      description="Listas de separação geradas a partir de pedidos de venda confirmados."
      apiPath="/api/pick-lists"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma lista de separação encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "started_at", label: "Iniciada em", format: (row) => formatDate(row.started_at) },
        { key: "completed_at", label: "Concluída em", format: (row) => formatDate(row.completed_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
