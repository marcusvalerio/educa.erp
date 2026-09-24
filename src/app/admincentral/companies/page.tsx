"use client";

import { useState } from "react";
import { Building2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select, Switch } from "@/components/ui/Controls";
import { Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { dateCol, enumFilter, numberCol, statusCol, textCol } from "@/components/data-table/columns";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { formatDate } from "@/lib/format";
import { CompanyAdminSection, NewCompanyDialog } from "@/components/platform/CompanyOnboarding";
import { LIFECYCLE_LABEL, companyRef, platformSend, type LifecycleStatus, type PlatformCompany, type PlatformCompanyModule } from "@/components/platform/data";

// Empresas como clientes da plataforma: ciclo de vida e módulos
// contratados. Identificadas pelo id — a política de companies não
// expõe nome/razão social à plataforma (limite registrado em docs/UI.md).
export default function PlatformCompaniesPage() {
  const { canPlatform } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  return (
    <>
    <ResourceListPage<PlatformCompany>
      title="Empresas"
      description="Empresas clientes da plataforma, seu ciclo de vida e os módulos contratados."
      apiPath="/api/platform/companies"
      tableId="platform-companies"
      rowId={(row) => row.company_id}
      refreshToken={refresh}
      searchPlaceholder="Buscar por identificador ou plano..."
      actions={
        canPlatform("platform.companies.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Building2 size={14} aria-hidden /> Nova empresa
          </Button>
        ) : undefined
      }
      summary={
        <Alert tone="info" title="Identificação por código">
          As empresas aparecem pelo identificador: a Administração Central não lê o cadastro (nome, documento) das empresas.
        </Alert>
      }
      columns={[
        textCol<PlatformCompany>("company_id", "Empresa", { mono: true, mobile: "title", cell: (row) => companyRef(row.company_id), exportValue: (row) => row.company_id }),
        statusCol<PlatformCompany>("company_lifecycle", "lifecycle_status", "Ciclo de vida"),
        textCol<PlatformCompany>("plan_code", "Plano", { mono: true }),
        dateCol<PlatformCompany>("contracted_at", "Contratada em"),
        numberCol<PlatformCompany>("modules_contracted", "Módulos contratados", { digits: 0 }),
        numberCol<PlatformCompany>("modules_enabled", "Habilitados", { digits: 0 }),
        dateCol<PlatformCompany>("suspended_at", "Suspensa em", { defaultHidden: true }),
      ]}
      filters={[enumFilter<PlatformCompany>("lifecycle_status", "Ciclo de vida", (Object.keys(LIFECYCLE_LABEL) as LifecycleStatus[]).map((k) => [k, LIFECYCLE_LABEL[k]]))]}
      detail={{
        title: (row) => companyRef(row.company_id),
        subtitle: (row) => <span className="code">{row.company_id}</span>,
        badges: (row) => <StatusBadge entity="company_lifecycle" status={row.lifecycle_status} />,
        sections: [],
        history: false,
        render: (row) => <CompanyGovernance company={row} onChanged={() => setRefresh((n) => n + 1)} />,
      }}
      emptyDescription="Nenhuma empresa cadastrada na plataforma."
    />
    <NewCompanyDialog open={creating} onClose={() => setCreating(false)} onCreated={() => setRefresh((n) => n + 1)} />
    </>
  );
}

function CompanyGovernance({ company, onChanged }: { company: PlatformCompany; onChanged: () => void }) {
  const { canPlatform } = useSession();
  const canLifecycle = canPlatform("platform.companies.lifecycle");
  const canContract = canPlatform("platform.company_modules.manage");
  const modules = useCached<PlatformCompanyModule[]>(`/api/platform/companies/${company.company_id}/modules`, canPlatform("platform.company_modules.view"));
  const [status, setStatus] = useState<LifecycleStatus>(company.lifecycle_status);
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function applyLifecycle() {
    setBusy("lifecycle");
    try {
      await platformSend(`/api/platform/companies/${company.company_id}/lifecycle`, "POST", { lifecycleStatus: status, notes: notes.trim() || undefined });
      toast.success(`Ciclo de vida alterado para ${LIFECYCLE_LABEL[status].toLowerCase()}.`);
      setConfirm(false);
      setNotes("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o ciclo de vida.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleContract(mod: PlatformCompanyModule, contracted: boolean) {
    setBusy(mod.code);
    try {
      await platformSend(`/api/platform/companies/${company.company_id}/modules`, "POST", { moduleCode: mod.code, contracted });
      toast.success(`${mod.name} ${contracted ? "contratado" : "descontratado"}.`);
      modules.reload();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a contratação.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div><dt className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Plano</dt><dd className="code">{company.plan_code ?? "—"}</dd></div>
        <div><dt className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Contratada em</dt><dd className="tabular-nums">{formatDate(company.contracted_at)}</dd></div>
        <div><dt className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Suspensa em</dt><dd className="tabular-nums">{formatDate(company.suspended_at)}</dd></div>
        <div><dt className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Cancelada em</dt><dd className="tabular-nums">{formatDate(company.cancelled_at)}</dd></div>
        {company.notes && <div className="col-span-2"><dt className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Observações</dt><dd>{company.notes}</dd></div>}
      </dl>

      <CompanyAdminSection companyId={company.company_id} />

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Ciclo de vida</h3>
        {canLifecycle ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Nova situação">
                <Select value={status} onValueChange={(v) => setStatus(v as LifecycleStatus)} options={(Object.keys(LIFECYCLE_LABEL) as LifecycleStatus[]).map((k) => ({ value: k, label: LIFECYCLE_LABEL[k] }))} />
              </FormField>
            </div>
            <FormField label="Motivo" help="Fica registrado na auditoria da plataforma.">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
            <div className="flex justify-end">
              <Button size="sm" disabled={status === company.lifecycle_status} onClick={() => setConfirm(true)}>Aplicar situação</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">O seu papel na plataforma não altera o ciclo de vida.</p>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <div>
          <h3 className="text-sm font-semibold">Módulos contratados</h3>
          <p className="text-xs text-muted-foreground">A empresa só pode habilitar internamente o que estiver contratado aqui.</p>
        </div>
        {modules.error ? (
          <p className="text-sm text-danger-fg">{modules.error}</p>
        ) : modules.loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(modules.data ?? []).map((mod) => {
              const contracted = mod.is_core || mod.contracted === true;
              return (
                <li key={mod.code} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm">
                    {mod.name}
                    {mod.contracted && !mod.is_core && mod.enabled_by_company === false && <span className="ml-2 text-xs text-subtle-foreground">desabilitado pela empresa</span>}
                  </span>
                  {mod.is_core ? (
                    <Badge icon={<Lock size={11} aria-hidden />}>Essencial</Badge>
                  ) : (
                    <Switch
                      checked={contracted}
                      disabled={!canContract || busy !== null}
                      onCheckedChange={(v) => toggleContract(mod, v)}
                      aria-label={`${contracted ? "Descontratar" : "Contratar"} ${mod.name}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirm && (
        <ConfirmDialog
          open
          title={`Alterar para ${LIFECYCLE_LABEL[status].toLowerCase()}?`}
          description={
            status === "SUSPENDED" || status === "CANCELLED"
              ? "A empresa deixa de operar normalmente. Os dados dela não são apagados."
              : "A empresa volta a operar conforme os módulos contratados."
          }
          confirmLabel="Aplicar"
          tone={status === "SUSPENDED" || status === "CANCELLED" ? "danger" : "default"}
          loading={busy === "lifecycle"}
          onConfirm={applyLifecycle}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
