"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { WarehouseLocationRow } from "@/lib/database/schema";

export default function EnderecamentoPage() {

  return (
    <ResourceListPage<WarehouseLocationRow>
      title="Endereçamento de estoque"
      description="Locais de armazenagem por armazém, corredor, prateleira e nível."
      apiPath="/api/warehouse-locations"
      searchPlaceholder="Buscar endereço, zona ou corredor..."
      columns={[
        codeCol<WarehouseLocationRow>("code", "Endereço"),
        textCol<WarehouseLocationRow>("name", "Nome", { mobile: "meta" }),
        textCol<WarehouseLocationRow>("purpose", "Finalidade", { mobile: "meta" }),
        textCol<WarehouseLocationRow>("zone", "Zona", { width: "6rem" }),
        textCol<WarehouseLocationRow>("aisle", "Corredor", { width: "6rem" }),
        statusCol<WarehouseLocationRow>(undefined),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.name,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
