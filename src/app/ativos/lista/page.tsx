"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { AssetRow } from "@/lib/database/schema";

export default function AtivosListaPage() {
  const categories = useIdNameLookup("/api/asset-categories");
  const locations = useIdNameLookup("/api/asset-locations");

  return (
    <ResourceListPage<AssetRow>
      breadcrumbParent={{ label: "Ativos", href: "/ativos" }}
      pageLabel="Ativos"
      title="Ativos"
      description="Cadastro de ativos físicos — máquinas, equipamentos e veículos, com hierarquia de sub-ativos. Ativo não é estoque."
      apiPath="/api/assets"
      searchKeys={["code", "description", "manufacturer", "model", "serial_number"]}
      searchPlaceholder="Buscar por código, descrição, fabricante..."
      emptyHint="Nenhum ativo encontrado."
      detailTitle={(row) => row.description}
      detailHref={(row) => `/ativos/lista/${row.id}`}
      columns={[
        { key: "code", label: "Código" },
        { key: "description", label: "Descrição" },
        { key: "category", label: "Categoria", format: (row) => (row.category_id ? categories.get(row.category_id) ?? row.category_id : "—") },
        { key: "location", label: "Local", format: (row) => (row.location_id ? locations.get(row.location_id) ?? row.location_id : "—") },
        { key: "acquisition_cost", label: "Custo de aquisição", align: "right", format: (row) => formatCurrencyBRL(row.acquisition_cost) },
        { key: "acquisition_date", label: "Aquisição", format: (row) => formatDate(row.acquisition_date) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
