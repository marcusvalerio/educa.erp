"use client";

import { OrgCrudPage, type OrgCrudConfig } from "@/components/admin/OrgCrudPage";
import { useAdminCollections } from "@/components/admin/data";

// Setores em árvore (parent_id). O banco impede ciclos na hierarquia.
export default function AdminDepartmentsPage() {
  const { departments, positions } = useAdminCollections();
  const byId = new Map((departments.data ?? []).map((d) => [d.id, d]));
  const positionCount = (id: string) => (positions.data ?? []).filter((p) => p.department_id === id && p.status === "active").length;

  const config: OrgCrudConfig = {
    title: "Setores",
    description: "Estrutura de setores da empresa. Setores orientam cargos, papéis típicos e o foco dos painéis.",
    apiPath: "/api/admin/departments",
    viewPermission: "departments.view",
    createPermission: "departments.create",
    updatePermission: "departments.update",
    noun: "Setor",
    parentKey: "parent_id",
    emptyDescription: "Crie o primeiro setor para organizar cargos e usuários.",
    fields: [
      { key: "code", label: "Código", required: true, createOnly: true, mono: true, help: "Ex.: COMPRAS, FIN, LOG." },
      { key: "name", label: "Nome", required: true },
      { key: "description", label: "Descrição", type: "textarea" },
      {
        key: "parentId",
        label: "Setor superior",
        type: "select",
        options: (_form, editing) => [
          { value: "", label: "Nenhum (setor raiz)" },
          ...(departments.data ?? []).filter((d) => d.status === "active" && d.id !== editing?.id).map((d) => ({ value: d.id, label: d.name })),
        ],
      },
    ],
    columns: [
      { header: "Superior", cell: (row) => (row.parent_id ? byId.get(row.parent_id as string)?.name ?? "—" : "—"), className: "text-muted-foreground" },
      { header: "Cargos ativos", align: "right", cell: (row) => positionCount(row.id) },
    ],
    fromRow: (row) => ({ code: row.code, name: row.name, description: (row.description as string) ?? "", parentId: (row.parent_id as string) ?? "" }),
    toBody: (f, mode) =>
      mode === "create"
        ? { code: f.code.trim(), name: f.name.trim(), description: f.description.trim() || undefined, parentId: f.parentId || undefined }
        : { name: f.name.trim(), description: f.description.trim(), parentId: f.parentId },
  };
  return <OrgCrudPage config={config} />;
}
