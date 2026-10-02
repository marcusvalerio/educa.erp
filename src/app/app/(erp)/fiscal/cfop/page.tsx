"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { FiscalCfopRow } from "@/lib/database/schema";

// Códigos gravados → texto da tela (antes aparecia "SAIDA" e "INTERNAL").
const DIRECTION_LABELS: Record<string, string> = { ENTRADA: "Entrada", SAIDA: "Saída" };
const SCOPE_LABELS: Record<string, string> = { INTERNAL: "Dentro do estado", INTERSTATE: "Outro estado", FOREIGN: "Exterior" };

export default function CfopPage() {

  return (
    <ResourceListPage<FiscalCfopRow>
      title="Códigos CFOP"
      description="Código Fiscal de Operações e Prestações usado na natureza da operação."
      apiPath="/api/fiscal-cfops"
      searchPlaceholder="Buscar CFOP ou descrição..."
      columns={[
        codeCol<FiscalCfopRow>("code", "CFOP"),
        textCol<FiscalCfopRow>("description", "Descrição", { mobile: "meta" }),
        textCol<FiscalCfopRow>("direction", "Direção", { width: "7rem", value: (row) => DIRECTION_LABELS[String(row.direction)] ?? row.direction }),
        textCol<FiscalCfopRow>("scope", "Abrangência", { width: "9rem", value: (row) => SCOPE_LABELS[String(row.scope)] ?? row.scope }),
        statusCol<FiscalCfopRow>(undefined),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.description,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
