"use client";

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { enumFilter, numberCol, statusCol, textCol } from "@/components/data-table/columns";
import type { PlatformModule } from "@/components/platform/data";

// Catálogo de módulos da plataforma, com as famílias de permissão que
// cada um governa e quantas empresas o contrataram/habilitaram.
export default function PlatformModulesPage() {
  return (
    <ResourceListPage<PlatformModule>
      title="Módulos da plataforma"
      description="Catálogo de módulos, as permissões que cada um governa e a adoção pelas empresas."
      apiPath="/api/platform/modules"
      tableId="platform-modules"
      rowId={(row) => row.code}
      searchPlaceholder="Buscar módulo..."
      columns={[
        textCol<PlatformModule>("name", "Módulo", { mobile: "title", cell: (row) => (
          <span className="flex items-center gap-2">
            {row.name}
            {row.is_core && <Badge icon={<Lock size={11} aria-hidden />}>Essencial</Badge>}
          </span>
        ) }),
        textCol<PlatformModule>("code", "Código", { mono: true, defaultHidden: true }),
        textCol<PlatformModule>("category", "Categoria", { mobile: "meta" }),
        numberCol<PlatformModule>("companies_contracted", "Empresas contratantes", { digits: 0 }),
        numberCol<PlatformModule>("companies_enabled", "Habilitado em", { digits: 0 }),
        { id: "permission_modules", header: "Permissões governadas", value: (row) => row.permission_modules.length, align: "right" },
        statusCol<PlatformModule>(undefined, "status", "Status"),
      ]}
      filters={[enumFilter<PlatformModule>("is_core", "Tipo", [["true", "Essenciais"], ["false", "Opcionais"]])]}
      detail={{
        title: (row) => row.name,
        subtitle: (row) => row.description ?? undefined,
        badges: (row) => (row.is_core ? <Badge icon={<Lock size={11} aria-hidden />}>Essencial</Badge> : undefined),
        history: false,
        sections: [
          {
            title: "Adoção",
            fields: [
              { label: "Código", value: (row) => <span className="code">{row.code}</span> },
              { label: "Categoria", value: (row) => row.category ?? "—" },
              { label: "Empresas contratantes", value: (row) => row.companies_contracted },
              { label: "Habilitado em", value: (row) => row.companies_enabled },
            ],
          },
        ],
        render: (row) => (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Famílias de permissão</h3>
            {row.permission_modules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma família de permissão associada.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {row.permission_modules.map((p) => (
                  <li key={p} className="code rounded-sm border border-border bg-surface-muted px-2 py-0.5 text-xs">{p}</li>
                ))}
              </ul>
            )}
          </div>
        ),
      }}
      emptyDescription="O catálogo de módulos está vazio."
    />
  );
}
