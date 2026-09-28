"use client";

import { OrgCrudPage, type OrgCrudConfig } from "@/components/admin/OrgCrudPage";
import { formatDate } from "@/lib/format";

// Unidades (filiais) da empresa. Os dados operacionais visíveis a cada
// usuário ficam limitados às unidades liberadas para ele.
const config: OrgCrudConfig = {
  title: "Unidades",
  description: "Filiais e unidades de operação. O acesso de cada usuário é liberado por unidade em Usuários.",
  apiPath: "/api/admin/branches",
  viewPermission: "branches.read",
  createPermission: "branches.manage",
  updatePermission: "branches.manage",
  noun: "Unidade",
  emptyDescription: "Cadastre a primeira unidade da empresa.",
  fields: [
    { key: "code", label: "Código", required: true, createOnly: true, mono: true, help: "Até 32 caracteres. Ex.: MATRIZ, SP01." },
    { key: "name", label: "Nome", required: true },
  ],
  columns: [{ header: "Criada em", cell: (row) => formatDate(row.created_at as string), className: "tabular-nums text-muted-foreground" }],
  fromRow: (row) => ({ code: row.code, name: row.name }),
  toBody: (f, mode) => (mode === "create" ? { code: f.code.trim(), name: f.name.trim() } : { name: f.name.trim() }),
};

export default function AdminBranchesPage() {
  return <OrgCrudPage config={config} />;
}
