"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, Switch } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Alert, EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { adminSend, useAdminCollections } from "@/components/admin/data";

// Configurações da empresa: prioridades dos painéis (foco por setor,
// cargo ou papel — fn_set_company_focus_rule) e acesso aos parâmetros
// gerais. Regras sem empresa são o padrão da plataforma (só leitura).

type FocusArea = { code: string; name: string; description: string | null; module_code: string | null; required_permission: string | null; default_priority: number; status: string };
type FocusRule = { id: string; company_id: string | null; scope_type: "DEPARTMENT" | "POSITION" | "ROLE"; scope_value: string; focus_code: string; priority: number; is_suppressed: boolean; status: string };
type RuleForm = { scopeType: FocusRule["scope_type"]; scopeValue: string; focusCode: string; priority: string; isSuppressed: boolean };

const SCOPE_LABEL: Record<FocusRule["scope_type"], string> = { DEPARTMENT: "Setor", POSITION: "Cargo", ROLE: "Papel" };

export default function AdminSettingsPage() {
  const { can } = useSession();
  const canConfigure = can("dashboard.configure");
  const focus = useCached<{ areas: FocusArea[]; rules: FocusRule[] }>("/api/admin/focus", canConfigure || can("settings.view"));
  const { departments, positions, roles } = useAdminCollections();
  const [scopeFilter, setScopeFilter] = useState<"" | FocusRule["scope_type"]>("");
  const [dialog, setDialog] = useState<RuleForm | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof RuleForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const scopeOptions = useMemo(
    () => ({
      DEPARTMENT: (departments.data ?? []).map((d) => ({ value: d.code, label: d.name })),
      POSITION: (positions.data ?? []).map((p) => ({ value: p.code, label: p.name })),
      ROLE: (roles.data ?? []).map((r) => ({ value: r.code, label: r.name })),
    }),
    [departments.data, positions.data, roles.data]
  );
  const scopeName = (type: FocusRule["scope_type"], value: string) => scopeOptions[type].find((o) => o.value === value)?.label ?? value;
  const areaName = new Map((focus.data?.areas ?? []).map((a) => [a.code, a.name]));
  const rules = (focus.data?.rules ?? []).filter((r) => !scopeFilter || r.scope_type === scopeFilter);

  async function save(form: RuleForm) {
    const found: Partial<Record<keyof RuleForm, string>> = {};
    if (!form.scopeValue) found.scopeValue = "Escolha a quem a regra se aplica.";
    if (!form.focusCode) found.focusCode = "Escolha o foco.";
    if (form.priority && !/^\d{1,4}$/.test(form.priority)) found.priority = "Use um número de 1 a 9999.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await adminSend("/api/admin/focus", "POST", {
        scopeType: form.scopeType,
        scopeValue: form.scopeValue,
        focusCode: form.focusCode,
        priority: form.priority ? Number(form.priority) : undefined,
        isSuppressed: form.isSuppressed,
      });
      toast.success(form.isSuppressed ? "Foco ocultado para este escopo." : "Regra de foco salva.");
      setDialog(null);
      focus.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a regra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" description="Como os painéis priorizam informações para cada setor, cargo e papel — e os parâmetros gerais da empresa." />

      <section className="flex flex-col gap-2">
        <SectionTitle
          title="Foco dos painéis"
          description="Define quais áreas aparecem primeiro para cada público. Regras da empresa complementam o padrão da plataforma."
          actions={
            canConfigure ? (
              <Button size="sm" onClick={() => { setErrors({}); setDialog({ scopeType: "DEPARTMENT", scopeValue: "", focusCode: "", priority: "", isSuppressed: false }); }}>
                <Plus size={14} aria-hidden /> Nova regra
              </Button>
            ) : undefined
          }
        />
        {!canConfigure && <Alert tone="info" title="Somente leitura">Alterar o foco dos painéis exige a permissão de configuração de dashboards.</Alert>}
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Select
              size="sm"
              aria-label="Escopo"
              value={scopeFilter}
              onValueChange={(v) => setScopeFilter(v as typeof scopeFilter)}
              options={[{ value: "", label: "Todos os escopos" }, { value: "DEPARTMENT", label: "Setores" }, { value: "POSITION", label: "Cargos" }, { value: "ROLE", label: "Papéis" }]}
              className="w-44"
            />
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">{rules.length} regra(s)</span>
          </div>
          {focus.loading ? (
            <SkeletonRows rows={4} />
          ) : focus.error ? (
            <EmptyState compact kind="error" title="Regras indisponíveis" description={focus.error} onRetry={focus.reload} />
          ) : rules.length === 0 ? (
            <EmptyState compact title="Nenhuma regra" description="Sem regras, os painéis usam as prioridades padrão de cada área." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-left text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                    <th scope="col" className="h-8 px-4">Aplica-se a</th>
                    <th scope="col" className="h-8 px-4">Foco</th>
                    <th scope="col" className="h-8 px-4 text-right">Prioridade</th>
                    <th scope="col" className="h-8 px-4">Origem</th>
                    <th scope="col" className="h-8 px-4">Exibição</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => {
                    const own = rule.company_id !== null;
                    return (
                      <tr key={rule.id} className="h-10 border-b border-border last:border-0 hover:bg-surface-hover">
                        <td className="px-4"><span className="text-xs text-muted-foreground">{SCOPE_LABEL[rule.scope_type]}:</span> {scopeName(rule.scope_type, rule.scope_value)}</td>
                        <td className="px-4">{areaName.get(rule.focus_code) ?? rule.focus_code}</td>
                        <td className="px-4 text-right tabular-nums">{rule.priority}</td>
                        <td className="px-4">{own ? <Badge tone="accent">Empresa</Badge> : <Badge>Padrão da plataforma</Badge>}</td>
                        <td className="px-4">
                          {canConfigure ? (
                            <Switch
                              checked={!rule.is_suppressed}
                              disabled={saving}
                              aria-label={`${rule.is_suppressed ? "Exibir" : "Ocultar"} ${areaName.get(rule.focus_code) ?? rule.focus_code} para ${scopeName(rule.scope_type, rule.scope_value)}`}
                              onCheckedChange={(on) => save({ scopeType: rule.scope_type, scopeValue: rule.scope_value, focusCode: rule.focus_code, priority: String(rule.priority), isSuppressed: !on })}
                            />
                          ) : rule.is_suppressed ? (
                            <Badge tone="neutral">Oculto</Badge>
                          ) : (
                            <Badge tone="success">Exibido</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle title="Outras configurações" />
        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
          {[
            { href: "/configuracoes/parametros", label: "Parâmetros gerais", description: "Numeração, padrões fiscais e operacionais da empresa.", permission: "settings.view" },
            { href: "/configuracoes/empresa", label: "Dados da empresa", description: "Razão social, documento, contato e endereço.", permission: "companies.read" },
            { href: "/admin/modules", label: "Módulos", description: "Habilitar ou desabilitar módulos contratados.", permission: "company_modules.view" },
            { href: "/admin/audit", label: "Auditoria", description: "Histórico das alterações administrativas.", permission: "audit_logs.read" },
          ]
            .filter((l) => can(l.permission))
            .map((link) => (
              <li key={link.href} className="bg-surface">
                <Link href={link.href} className="group flex items-center justify-between gap-3 p-4 hover:bg-surface-hover">
                  <span>
                    <span className="block text-sm font-medium">{link.label}</span>
                    <span className="block text-xs text-muted-foreground">{link.description}</span>
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
      </section>

      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && !saving && setDialog(null)}
        title="Nova regra de foco"
        description="Se já existir uma regra para o mesmo público e foco, ela é atualizada."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => dialog && save(dialog)} loading={saving}>Salvar regra</Button>
          </>
        }
      >
        {dialog && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Tipo de público" required>
                <Select value={dialog.scopeType} onValueChange={(v) => setDialog({ ...dialog, scopeType: v as RuleForm["scopeType"], scopeValue: "" })} options={[{ value: "DEPARTMENT", label: "Setor" }, { value: "POSITION", label: "Cargo" }, { value: "ROLE", label: "Papel" }]} />
              </FormField>
              <FormField label={SCOPE_LABEL[dialog.scopeType]} required error={errors.scopeValue}>
                <Select value={dialog.scopeValue} onValueChange={(v) => setDialog({ ...dialog, scopeValue: v })} placeholder="Selecione" options={scopeOptions[dialog.scopeType]} />
              </FormField>
            </div>
            <FormField label="Foco" required error={errors.focusCode} help="Área do painel que ganha prioridade para esse público.">
              <Select value={dialog.focusCode} onValueChange={(v) => setDialog({ ...dialog, focusCode: v })} placeholder="Selecione" options={(focus.data?.areas ?? []).filter((a) => a.status === "active").map((a) => ({ value: a.code, label: a.name }))} />
            </FormField>
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <FormField label="Prioridade" help="Menor número aparece primeiro." error={errors.priority}>
                <Input inputMode="numeric" value={dialog.priority} placeholder="100" onChange={(e) => setDialog({ ...dialog, priority: e.target.value })} />
              </FormField>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Switch checked={dialog.isSuppressed} onCheckedChange={(v) => setDialog({ ...dialog, isSuppressed: v })} />
                Ocultar este foco para o público
              </label>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
