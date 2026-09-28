"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, numberCol, statusCol, refCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ProductBomRow } from "@/lib/database/schema";

export default function EstruturasPage() {
  const products = useIdNameLookup("/api/products");

  return (
    <ResourceListPage<ProductBomRow>
      title="Estruturas de produto (BOM)"
      description="Fichas técnicas por produto e versão — base das ordens de produção."
      apiPath="/api/product-boms"
      searchPlaceholder="Buscar estrutura ou produto..."
      columns={[
        codeCol<ProductBomRow>("code", "Estrutura"),
        refCol<ProductBomRow>("product_id", "Produto", products, { mobile: "meta" }),
        numberCol<ProductBomRow>("version", "Versão", { digits: 0, width: "5rem" }),
        numberCol<ProductBomRow>("reference_quantity", "Qtd. referência"),
        dateCol<ProductBomRow>("valid_from", "Vigência"),
        statusCol<ProductBomRow>("product_boms"),
      ]}
      filters={[statusFilter<ProductBomRow>("product_boms", "status", { server: true })]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => products.get(row.product_id) ?? undefined,
        badges: (row) => <StatusBadge entity="product_boms" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
