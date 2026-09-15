"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { SystemSettingRow } from "@/lib/database/schema";

function settingValue(row: SystemSettingRow): string {
  switch (row.value_type) {
    case "STRING":
      return row.value_string ?? "—";
    case "INTEGER":
      return row.value_integer !== null ? String(row.value_integer) : "—";
    case "DECIMAL":
      return row.value_decimal !== null ? String(row.value_decimal) : "—";
    case "BOOLEAN":
      return row.value_boolean === null ? "—" : row.value_boolean ? "Sim" : "Não";
    case "DATE":
      return row.value_date ?? "—";
    case "JSON":
      return row.value_json ? JSON.stringify(row.value_json) : "—";
    default:
      return "—";
  }
}

export default function ParametrosPage() {
  return (
    <ResourceListPage<SystemSettingRow>
      breadcrumbParent={{ label: "Configurações", href: "/configuracoes" }}
      pageLabel="Parâmetros"
      title="Parâmetros do sistema"
      description="Configurações globais e por empresa (fn_resolve_setting) — precedência Estabelecimento > Empresa > Global."
      apiPath="/api/settings"
      searchKeys={["module", "key"]}
      searchPlaceholder="Buscar por módulo ou chave..."
      emptyHint="Nenhum parâmetro encontrado."
      detailTitle={(row) => `${row.module}.${row.key}`}
      columns={[
        { key: "module", label: "Módulo" },
        { key: "key", label: "Chave" },
        { key: "value_type", label: "Tipo" },
        { key: "value", label: "Valor", format: settingValue },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
