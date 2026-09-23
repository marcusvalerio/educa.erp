"use client";

import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { DistributionBar, RankingBars } from "@/components/charts/Charts";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { PLATFORM_ICONS, PLATFORM_NAV } from "@/lib/nav";
import { formatInteger } from "@/lib/format";
import { LIFECYCLE_LABEL, type LifecycleStatus, type PlatformModule, type PlatformOverview } from "@/components/platform/data";

// Visão geral da PLATAFORMA: carteira de empresas por ciclo de vida,
// adoção de módulos e membros. Nenhum número operacional de tenant.
export default function PlatformOverviewPage() {
  const { data, canPlatform } = useSession();
  const overview = useCached<PlatformOverview>("/api/platform/overview");
  const modules = useCached<PlatformModule[]>("/api/platform/modules", canPlatform("platform.modules.view"));
  const o = overview.data;
  const lifecycle = o?.companies.byLifecycle ?? {};
  const tones: Record<LifecycleStatus, "info" | "success" | "warning" | "critical"> = { TRIAL: "info", ACTIVE: "success", SUSPENDED: "warning", CANCELLED: "critical" };
  const adoption = (modules.data ?? [])
    .filter((m) => !m.is_core)
    .map((m) => ({ id: m.code, label: m.name, value: m.companies_enabled, sublabel: `${m.companies_contracted} contratada(s)` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const links = PLATFORM_NAV[0].items.filter((i) => i.href !== "/admincentral" && (!i.permission || canPlatform(i.permission as string)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Plataforma EDUCA"
        title="Administração Central"
        description="Governança da plataforma: empresas como clientes, contratação de módulos e membros da operação EDUCA."
        meta={data?.platform ? <StatusBadge entity="platform_role" status={data.platform.role} /> : undefined}
      />

      <Alert tone="info" title="Isolamento entre empresas">
        A Administração Central não acessa pedidos, estoque, financeiro ou qualquer dado operacional das empresas, e não existe acesso “como empresa”.
      </Alert>

      {overview.error ? (
        <EmptyState kind="error" title="Visão geral indisponível" description={overview.error} onRetry={overview.reload} />
      ) : (
        <StatStrip columns={6}>
          <Stat label="Empresas" value={o ? formatInteger(o.companies.total) : "—"} loading={overview.loading} href="/admincentral/companies" />
          <Stat label="Ativas" value={o ? formatInteger(lifecycle.ACTIVE ?? 0) : "—"} loading={overview.loading} />
          <Stat label="Em avaliação" value={o ? formatInteger(lifecycle.TRIAL ?? 0) : "—"} loading={overview.loading} />
          <Stat label="Suspensas" value={o ? formatInteger(lifecycle.SUSPENDED ?? 0) : "—"} tone={(lifecycle.SUSPENDED ?? 0) > 0 ? "warning" : "neutral"} loading={overview.loading} />
          <Stat label="Módulos no catálogo" value={o ? formatInteger(o.modules.total) : "—"} hint={o ? `${o.modules.core} essenciais` : undefined} loading={overview.loading} href="/admincentral/modules" />
          <Stat label="Membros ativos" value={o?.members ? formatInteger(o.members.owners + o.members.admins) : "—"} hint={o?.members ? `${o.members.owners} owner · ${o.members.admins} admin` : undefined} loading={overview.loading} href="/admincentral/platform-members" />
        </StatStrip>
      )}

      {o?.members && o.members.owners === 0 && (
        <Alert tone="danger" title="Nenhum Platform Owner ativo">
          <span className="inline-flex items-center gap-1.5"><ShieldAlert size={14} aria-hidden /> Sem um Owner ativo, ninguém pode gerir outros Owners. Cadastre um em Membros da plataforma.</span>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Empresas por ciclo de vida"
          loading={overview.loading}
          error={overview.error}
          empty={!!o && o.companies.total === 0}
          emptyTitle="Nenhuma empresa cadastrada"
          height={96}
          table={{ columns: [{ label: "Situação" }, { label: "Empresas", align: "right" }], rows: (Object.keys(LIFECYCLE_LABEL) as LifecycleStatus[]).map((k) => [LIFECYCLE_LABEL[k], formatInteger(lifecycle[k] ?? 0)]) }}
        >
          <DistributionBar
            parts={(Object.keys(LIFECYCLE_LABEL) as LifecycleStatus[]).map((k) => ({ id: k, label: LIFECYCLE_LABEL[k], value: lifecycle[k] ?? 0, tone: tones[k], href: `/admincentral/companies?lifecycle_status=${k}` }))}
            format={formatInteger}
          />
        </ChartPanel>
        {canPlatform("platform.modules.view") && (
          <ChartPanel
            title="Adoção de módulos"
            description="Empresas com o módulo contratado e habilitado."
            loading={modules.loading}
            error={modules.error}
            empty={!!modules.data && adoption.every((a) => a.value === 0)}
            emptyTitle="Nenhum módulo opcional em uso"
            height={180}
            table={{ columns: [{ label: "Módulo" }, { label: "Habilitado em", align: "right" }], rows: adoption.map((a) => [a.label, formatInteger(a.value)]) }}
          >
            <RankingBars items={adoption} format={formatInteger} />
          </ChartPanel>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle title="Governança" />
        <Panel>
          <PanelHeader title="Áreas da Administração Central" />
          <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {links.map((item) => {
              const Icon = PLATFORM_ICONS[item.href];
              return (
                <li key={item.href} className="bg-surface">
                  <Link href={item.href} className="group flex items-center gap-3 p-4 hover:bg-surface-hover">
                    {Icon && <Icon size={16} className="shrink-0 text-subtle-foreground" aria-hidden />}
                    <span className="flex-1 text-sm font-medium">{item.label}</span>
                    <ArrowRight size={14} className="text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>
    </div>
  );
}
