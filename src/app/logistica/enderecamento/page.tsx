"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { WarehouseLocationRow } from "@/lib/database/schema";

export default function EnderecamentoPage() {
  return (
    <ResourceListPage<WarehouseLocationRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Endereçamento"
      title="Endereçamento de estoque"
      description="Locais de armazenagem por armazém, corredor, prateleira e nível (mesmo cadastro de Locais de estoque)."
      apiPath="/api/warehouse-locations"
      searchKeys={["code", "name", "zone", "aisle"]}
      searchPlaceholder="Buscar por código, zona, corredor..."
      emptyHint="Nenhum local de estoque encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "purpose", label: "Finalidade" },
        { key: "zone", label: "Zona" },
        { key: "aisle", label: "Corredor" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
