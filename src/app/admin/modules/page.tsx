"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Controls";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Alert, EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { formatDate } from "@/lib/format";
import { adminSend, type AdminModule } from "@/components/admin/data";

// Módulos da empresa. A CONTRATAÇÃO é decidida pela plataforma; aqui a
// empresa só liga/desliga o que já foi contratado (fn_company_set_module_enabled).
// Módulos core não podem ser desligados — o banco recusa.
export default function AdminModulesPage() {
  const { can } = useSession();
  const canManage = can("company_modules.manage");
  const res = useCached<AdminModule[]>("/api/admin/modules", can("company_modules.view"));
  const [pending, setPending] = useState<{ mod: AdminModule; enabled: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  async function apply() {
    if (!pending) return;
    setSaving(true);
    try {
      await adminSend(`/api/admin/modules/${pending.mod.code}`, "PATCH", { enabled: pending.enabled });
      toast.success(`${pending.mod.name} ${pending.enabled ? "habilitado" : "desabilitado"}.`);
      setPending(null);
      res.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o módulo.");
    } finally {
      setSaving(false);
    }
  }

  const modules = res.data ?? [];
  const categories = [...new Set(modules.map((m) => m.category ?? "Outros"))];
  const active = modules.filter((m) => m.is_core || (m.contracted && m.enabled_by_company)).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Módulos"
        description="Módulos contratados pela empresa e quais estão habilitados para uso. Desabilitar um módulo oculta suas telas e bloqueia suas permissões."
        meta={res.data ? <span className="tabular-nums">{active} de {modules.length} em uso</span> : undefined}
      />
      {!canManage && <Alert tone="info" title="Somente leitura">O seu perfil pode consultar, mas não alterar, os módulos.</Alert>}
      {res.loading ? (
        <Panel><SkeletonRows rows={6} /></Panel>
      ) : res.error ? (
        <EmptyState kind="error" title="Módulos indisponíveis" description={res.error} onRetry={res.reload} />
      ) : modules.length === 0 ? (
        <EmptyState title="Nenhum módulo no catálogo" />
      ) : (
        categories.map((category) => (
          <Panel key={category}>
            <PanelHeader title={category} />
            <ul className="divide-y divide-border">
              {modules
                .filter((m) => (m.category ?? "Outros") === category)
                .map((mod) => {
                  const contracted = mod.is_core || mod.contracted === true;
                  const enabled = mod.is_core || (contracted && mod.enabled_by_company !== false);
                  const switchId = `mod-${mod.code}`;
                  return (
                    <li key={mod.code} className="flex items-center gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={switchId} className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {mod.name}
                          {mod.is_core && <Badge icon={<Lock size={11} aria-hidden />}>Essencial</Badge>}
                          {!contracted && <Badge tone="neutral">Não contratado</Badge>}
                          {contracted && !mod.is_core && !enabled && <Badge tone="warning">Desabilitado</Badge>}
                        </label>
                        {mod.description && <p className="mt-0.5 text-xs text-muted-foreground">{mod.description}</p>}
                        {!contracted && <p className="mt-0.5 text-xs text-subtle-foreground">A contratação é feita pela plataforma EDUCA.</p>}
                        {mod.disabled_at && !enabled && <p className="mt-0.5 text-2xs text-subtle-foreground tabular-nums">Desabilitado em {formatDate(mod.disabled_at)}</p>}
                      </div>
                      <Switch
                        id={switchId}
                        checked={enabled}
                        disabled={!canManage || mod.is_core || !contracted || saving}
                        onCheckedChange={(next) => setPending({ mod, enabled: next })}
                        aria-label={`${enabled ? "Desabilitar" : "Habilitar"} ${mod.name}`}
                      />
                    </li>
                  );
                })}
            </ul>
          </Panel>
        ))
      )}
      {pending && (
        <ConfirmDialog
          open
          title={pending.enabled ? `Habilitar ${pending.mod.name}?` : `Desabilitar ${pending.mod.name}?`}
          description={
            pending.enabled
              ? "As telas e permissões do módulo voltam a valer para os papéis que as possuem."
              : "Ninguém da empresa poderá usar este módulo até ele ser habilitado de novo. Os dados são mantidos."
          }
          confirmLabel={pending.enabled ? "Habilitar" : "Desabilitar"}
          tone={pending.enabled ? "default" : "danger"}
          loading={saving}
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
