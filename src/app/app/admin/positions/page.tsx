"use client";

import { OrgCrudPage, type OrgCrudConfig } from "@/components/admin/OrgCrudPage";
import { useAdminCollections } from "@/components/admin/data";

export default function AdminPositionsPage() {
  const { departments } = useAdminCollections();
  const byId = new Map((departments.data ?? []).map((d) => [d.id, d]));

  const config: OrgCrudConfig = {
    title: "Cargos",
    description: "Cargos da empresa, opcionalmente vinculados a um setor. O cargo compõe o contexto e o foco do usuário.",
    apiPath: "/api/admin/positions",
    viewPermission: "positions.view",
    createPermission: "positions.create",
    updatePermission: "positions.update",
    noun: "Cargo",
    emptyDescription: "Crie cargos para completar o contexto organizacional dos usuários.",
    fields: [
      { key: "code", label: "Código", required: true, createOnly: true, mono: true, help: "Ex.: ANALISTA_COMPRAS." },
      { key: "name", label: "Nome", required: true },
      { key: "description", label: "Descrição", type: "textarea" },
      {
        key: "departmentId",
        label: "Setor",
        type: "select",
        options: () => [{ value: "", label: "Nenhum" }, ...(departments.data ?? []).filter((d) => d.status === "active").map((d) => ({ value: d.id, label: d.name }))],
      },
      {
        key: "seniorityLevel",
        label: "Nível de senioridade",
        type: "number",
        help: "Número de 0 a 999 (opcional), usado para ordenar cargos.",
        validate: (v) => (/^\d{1,3}$/.test(v) ? undefined : "Informe um número de 0 a 999."),
      },
    ],
    columns: [
      { header: "Setor", cell: (row) => (row.department_id ? byId.get(row.department_id as string)?.name ?? "—" : "—"), className: "text-muted-foreground" },
      { header: "Nível", align: "right", cell: (row) => (row.seniority_level ?? "—") as string },
    ],
    fromRow: (row) => ({
      code: row.code,
      name: row.name,
      description: (row.description as string) ?? "",
      departmentId: (row.department_id as string) ?? "",
      seniorityLevel: row.seniority_level === null || row.seniority_level === undefined ? "" : String(row.seniority_level),
    }),
    toBody: (f, mode) => ({
      ...(mode === "create" ? { code: f.code.trim() } : {}),
      name: f.name.trim(),
      description: mode === "create" ? f.description.trim() || undefined : f.description.trim(),
      departmentId: f.departmentId,
      seniorityLevel: f.seniorityLevel ? Number(f.seniorityLevel) : undefined,
    }),
  };
  return <OrgCrudPage config={config} />;
}
