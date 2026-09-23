"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Calendar, MapPin, Target, UserRound } from "lucide-react";
import { Segmented } from "@/components/ui/Controls";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { useSession } from "@/components/shell/SessionProvider";
import { ERP_NAV } from "@/lib/nav";
import { canAccess } from "@/lib/navigation/access";
import { PERIOD_LABELS, formatRange, periodRange, previousRange, type PeriodKey } from "@/lib/dashboard/periods";

// CONTEXTO do dashboard: quem, onde, qual recorte. E AÇÃO: o foco do
// usuário (fn_dashboard_context) convertido em atalhos permitidos.

export const MODULE_SECTION: Record<string, string> = {
  comercial: "comercial",
  crm: "crm",
  compras: "suprimentos",
  estoque: "logistica",
  logistica: "logistica",
  producao: "producao",
  financeiro: "financeiro",
  fiscal: "fiscal",
  controladoria: "gestao",
  custos: "gestao",
  relatorios: "gestao",
  qualidade: "qualidade",
  manutencao: "ativos",
  ativos: "ativos",
  projetos: "projetos",
  cadastros: "cadastros",
};

export function usePeriod() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("periodo");
  const key: PeriodKey = raw && raw in PERIOD_LABELS ? (raw as PeriodKey) : "mes";
  const range = useMemo(() => periodRange(key), [key]);
  const previous = useMemo(() => previousRange(range), [range]);
  const setKey = (next: PeriodKey) => {
    const q = new URLSearchParams(params.toString());
    if (next === "mes") q.delete("periodo");
    else q.set("periodo", next);
    const text = q.toString();
    router.replace(`${pathname}${text ? `?${text}` : ""}`, { scroll: false });
  };
  return { key, range, previous, setKey };
}

export function PeriodPicker() {
  const { key, setKey, range, previous } = usePeriod();
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Segmented
        label="Período"
        value={key}
        onChange={setKey}
        options={(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
      />
      <span className="text-2xs text-subtle-foreground tabular-nums">
        {formatRange(range)} · comparado a {formatRange(previous)}
      </span>
    </div>
  );
}

export function DashboardHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  const { data, branchId } = useSession();
  const tenant = data?.tenant;
  const branch = tenant?.branches.find((b) => b.id === branchId);
  const weekday = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const today = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {tenant && (
            <li className="flex items-center gap-1.5">
              <Building2 size={13} className="text-subtle-foreground" aria-hidden />
              {tenant.company.name}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <MapPin size={13} className="text-subtle-foreground" aria-hidden />
            {branch ? branch.name : (tenant?.branches.length ?? 0) > 0 ? "Todas as unidades" : "Sem unidade vinculada"}
          </li>
          {(tenant?.department || tenant?.position) && (
            <li className="flex items-center gap-1.5">
              <UserRound size={13} className="text-subtle-foreground" aria-hidden />
              {[tenant?.department?.name, tenant?.position?.name].filter(Boolean).join(" · ")}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Calendar size={13} className="text-subtle-foreground" aria-hidden />
            {today}
          </li>
        </ul>
      </div>
      <div className="flex shrink-0 flex-wrap items-end gap-2">{actions ?? <PeriodPicker />}</div>
    </header>
  );
}

/** "Seu foco": prioridades do contexto do usuário, já filtradas por permissão e módulo. */
export function FocusPanel() {
  const { data, can } = useSession();
  const focus = useMemo(() => data?.focus ?? [], [data]);
  const shortcuts = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ label: string; href: string; section: string }> = [];
    for (const area of focus) {
      const sectionId = area.module_code ? MODULE_SECTION[area.module_code] : undefined;
      const section = ERP_NAV.find((s) => s.id === sectionId);
      if (!section || seen.has(section.id)) continue;
      seen.add(section.id);
      for (const item of section.items.filter((i) => canAccess(i.permission, can)).slice(0, 3)) {
        out.push({ label: item.label, href: item.href, section: section.label });
      }
    }
    return out.slice(0, 9);
  }, [focus, can]);

  return (
    <Panel>
      <PanelHeader
        title="Seu foco"
        icon={<Target size={15} />}
        description={focus.length > 0 ? "Prioridades definidas para o seu setor, cargo e papéis." : "Nenhuma prioridade configurada para o seu contexto."}
      />
      {focus.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          O administrador da empresa pode definir focos por setor, cargo ou papel em Administração › Configurações.
        </p>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <ul className="flex flex-wrap gap-1.5">
            {focus.slice(0, 10).map((area) => (
              <li key={area.focus_code} className="rounded-sm border border-border bg-surface-muted px-2 py-0.5 text-xs text-foreground" title={area.description ?? undefined}>
                {area.name}
              </li>
            ))}
          </ul>
          {shortcuts.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {shortcuts.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="group flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-surface-hover">
                    <span className="min-w-0 truncate">
                      {s.label}
                      <span className="ml-2 text-xs text-subtle-foreground">{s.section}</span>
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
