"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Feedback";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { ADMIN_ICONS, ADMIN_NAV } from "@/lib/nav";
import { canAccess } from "@/lib/navigation/access";
import { formatInteger } from "@/lib/format";
import { useAdminCollections, type AdminModule, type AdminUser } from "@/components/admin/data";

// Visão geral da Administração da Empresa: situação da estrutura de
// acesso e o que falta configurar. Só a empresa da sessão — nunca outra.
export default function AdminOverviewPage() {
  const { can, data } = useSession();
  const tenant = data?.tenant;
  const users = useCached<AdminUser[]>("/api/admin/users", can("users.read"));
  const modules = useCached<AdminModule[]>("/api/admin/modules", can("company_modules.view"));
  const { departments, positions, roles, branches } = useAdminCollections();

  const activeUsers = (users.data ?? []).filter((u) => u.status === "active");
  const linksVisible = (users.data ?? []).every((u) => u.links_visible);
  const issues: Array<{ label: string; count: number; href: string }> = [];
  if (users.data) {
    issues.push({ label: "Usuários ativos sem login vinculado", count: activeUsers.filter((u) => !u.has_login).length, href: "/admin/users?acesso=sem-login" });
    if (linksVisible) {
      issues.push({ label: "Usuários ativos sem papel", count: activeUsers.filter((u) => u.role_ids.length === 0).length, href: "/admin/users?acesso=sem-papel" });
      issues.push({ label: "Usuários ativos sem unidade liberada", count: activeUsers.filter((u) => u.branch_access.length === 0).length, href: "/admin/users?acesso=sem-unidade" });
    }
    issues.push({ label: "Usuários ativos sem setor ou cargo", count: activeUsers.filter((u) => !u.department_id || !u.position_id).length, href: "/admin/users" });
  }
  if (roles.data) issues.push({ label: "Papéis ativos sem nenhuma permissão", count: roles.data.filter((r) => r.status === "active" && r.permission_codes.length === 0).length, href: "/admin/roles" });
  if (modules.data) issues.push({ label: "Módulos contratados desabilitados", count: modules.data.filter((m) => m.contracted && !m.is_core && m.enabled_by_company === false).length, href: "/admin/modules" });
  const open = issues.filter((i) => i.count > 0);
  const loadingIssues = users.loading || roles.loading || modules.loading;

  const sections = ADMIN_NAV[0].items.filter((i) => i.href !== "/admin" && canAccess(i.permission, can));
  const count = (rows: Array<{ status: string }> | null) => (rows ? formatInteger(rows.filter((r) => r.status === "active").length) : "—");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administração da Empresa"
        title={tenant?.company.name ?? "Administração"}
        description="Usuários, papéis, estrutura organizacional e módulos desta empresa. Nada aqui altera outras empresas da plataforma."
      />

      <StatStrip columns={6}>
        {can("users.read") && <Stat label="Usuários ativos" value={count(users.data)} loading={users.loading} href="/admin/users" />}
        {can("roles.read") && <Stat label="Papéis ativos" value={count(roles.data)} loading={roles.loading} href="/admin/roles" />}
        {can("departments.view") && <Stat label="Setores" value={count(departments.data)} loading={departments.loading} href="/admin/departments" />}
        {can("positions.view") && <Stat label="Cargos" value={count(positions.data)} loading={positions.loading} href="/admin/positions" />}
        {can("branches.read") && <Stat label="Unidades" value={count(branches.data)} loading={branches.loading} href="/admin/branches" />}
        {can("company_modules.view") && (
          <Stat
            label="Módulos em uso"
            value={modules.data ? formatInteger(modules.data.filter((m) => m.is_core || (m.contracted && m.enabled_by_company !== false)).length) : "—"}
            loading={modules.loading}
            href="/admin/modules"
          />
        )}
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader title="Pendências de configuração" description="Situações que costumam impedir alguém de trabalhar ou deixar acesso mal definido." />
          {loadingIssues ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : issues.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">Nenhuma verificação disponível para o seu perfil.</p>
          ) : open.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-5">
              <CheckCircle2 size={18} className="text-success-fg" aria-hidden />
              <p className="text-sm">Estrutura de acesso completa — {issues.length} verificação(ões) sem pendências.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {open.map((issue) => (
                <li key={issue.label}>
                  <Link href={issue.href} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                    <AlertTriangle size={15} className="shrink-0 text-warning-fg" aria-hidden />
                    <span className="flex-1 text-sm">{issue.label}</span>
                    <span className="text-md font-semibold tabular-nums">{formatInteger(issue.count)}</span>
                    <ArrowRight size={14} className="text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Seu acesso administrativo" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm">
            <dt className="text-muted-foreground">Empresa</dt>
            <dd>{tenant?.company.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Papéis</dt>
            <dd>{tenant?.roles.map((r) => r.name).join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Unidades</dt>
            <dd className="tabular-nums">{tenant ? formatInteger(tenant.branches.length) : "—"}</dd>
          </dl>
        </Panel>
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle title="Áreas da administração" />
        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((item) => {
            const Icon = ADMIN_ICONS[item.href];
            return (
              <li key={item.href} className="bg-surface">
                <Link href={item.href} className="group flex h-full items-center gap-3 p-4 hover:bg-surface-hover">
                  {Icon && <Icon size={16} className="shrink-0 text-subtle-foreground" aria-hidden />}
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  <ArrowRight size={14} className="text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
