"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { dateCol, enumFilter, statusCol, textCol } from "@/components/data-table/columns";
import type { SystemSettingRow } from "@/lib/database/schema";

function settingValue(row: SystemSettingRow): string {
  switch (row.value_type) {
    case "STRING":
      return row.value_string ?? "—";
    case "INTEGER":
      return row.value_integer !== null ? row.value_integer.toLocaleString("pt-BR") : "—";
    case "DECIMAL":
      return row.value_decimal !== null ? row.value_decimal.toLocaleString("pt-BR") : "—";
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

const SCOPE = (row: SystemSettingRow) => (row.establishment_id ? "Estabelecimento" : row.company_id ? "Empresa" : "Global");

export default function ParametrosPage() {
  return (
    <ResourceListPage<SystemSettingRow>
      title="Parâmetros do sistema"
      description="Configurações globais, da empresa e do estabelecimento. Precedência: Estabelecimento › Empresa › Global."
      apiPath="/api/settings"
      searchPlaceholder="Buscar módulo, chave ou valor..."
      columns={[
        textCol<SystemSettingRow>("module", "Módulo", { width: "8rem", mobile: "meta" }),
        textCol<SystemSettingRow>("key", "Chave", { mono: true, mobile: "title" }),
        textCol<SystemSettingRow>("scope", "Escopo", { value: SCOPE, width: "8rem" }),
        textCol<SystemSettingRow>("value_type", "Tipo", { width: "6rem", defaultHidden: true }),
        textCol<SystemSettingRow>("value", "Valor", { value: settingValue, mobile: "meta" }),
        dateCol<SystemSettingRow>("valid_until", "Válido até", { defaultHidden: true }),
        statusCol<SystemSettingRow>(undefined),
      ]}
      filters={[
        {
          ...enumFilter<SystemSettingRow>("scope", "Escopo", [
            ["Global", "Global"],
            ["Empresa", "Empresa"],
            ["Estabelecimento", "Estabelecimento"],
          ]),
          predicate: (row, value) => SCOPE(row) === value,
        },
      ]}
      detail={{
        title: (row) => `${row.module}.${row.key}`,
        subtitle: (row) => row.description ?? undefined,
        sections: [
          {
            title: "Parâmetro",
            fields: [
              { label: "Módulo", value: (row) => row.module },
              { label: "Chave", value: (row) => <span className="code">{row.key}</span> },
              { label: "Escopo", value: SCOPE },
              { label: "Tipo", value: (row) => row.value_type },
              { label: "Valor", value: settingValue, span: 2 },
              { label: "Descrição", value: (row) => row.description ?? "—", span: 2 },
            ],
          },
        ],
      }}
      emptyDescription="Nenhum parâmetro configurado."
    />
  );
}
