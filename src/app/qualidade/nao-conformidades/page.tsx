"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { NonconformityRow } from "@/lib/database/schema";

export default function NaoConformidadesPage() {
  return (
    <ResourceListPage<NonconformityRow>
      breadcrumbParent={{ label: "Qualidade", href: "/qualidade" }}
      pageLabel="Não conformidades"
      title="Não conformidades"
      description="Desvios identificados em inspeções ou abertos diretamente, da análise ao tratamento."
      apiPath="/api/nonconformities"
      searchKeys={["code", "description"]}
      searchPlaceholder="Buscar por código ou descrição..."
      emptyHint="Nenhuma não conformidade encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "description", label: "Descrição" },
        { key: "severity", label: "Severidade" },
        { key: "opened_at", label: "Aberta em", format: (row) => formatDate(row.opened_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
