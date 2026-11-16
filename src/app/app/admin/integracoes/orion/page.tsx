"use client";

import { useMemo, useState } from "react";
import { Download, RefreshCw, ShieldOff, UserPlus, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Select, Switch, Segmented } from "@/components/ui/Controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Alert, EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache, useCached } from "@/lib/dashboard/client";
import { apiSend } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

// Integrações › ORION (docs/INTEGRACAO-ATLAS-ORION.md §6.1, §7.2): configuração
// (etapas de liberação, NF-e antes da expedição, mapa de depósitos, carga
// inicial), acessos de funcionários, eventos (outbox/inbox: reprocessar e
// descartar) e reconciliação de estoque. O vínculo (URL, segredo) é feito
// pela Administração Central; a regra mora no banco (fn_orion_*).

type Overview = {
  integration: null | {
    status: string; orion_url: string; orion_company_id: string | null; key_id: string; stock_owner: string;
    sales_release_status: "approved" | "reserved"; purchase_release_status: "approved" | "sent"; production_release_status: "planned" | "released";
    auto_send: boolean; require_invoice_before_ship: boolean; cutover_at: string | null;
    last_outbound_success_at: string | null; last_inbound_success_at: string | null;
  };
  warehouseMap: Array<{ warehouse_id: string; orion_warehouse_code: string }>;
  warehouses: Array<{ id: string; code: string; name: string; status: string }>;
  access: Array<{ user_id: string; orion_role: string; warehouses: string[]; status: string; version: number; granted_at: string; revoked_at: string | null; revoke_reason: string | null }>;
  users: Array<{ id: string; name: string; email: string; status: string }>;
  queue: { pending: number; failed: number; oldestPendingAt: string | null };
};

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Pendente", tone: "neutral" },
  activating: { label: "Em ativação", tone: "warning" },
  active: { label: "Ativa", tone: "success" },
  suspended: { label: "Suspensa", tone: "danger" },
  disabled: { label: "Desativada", tone: "neutral" },
};
const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "supervisor", label: "Supervisor" },
  { value: "operator", label: "Operador" },
  { value: "auditor", label: "Auditor" },
];
const API = "/api/integrations/orion/admin";

export default function OrionIntegrationPage() {
  const { can } = useSession();
  const canView = can("orion.integration.view") || can("orion.access.manage");
  const res = useCached<Overview>(API, canView);
  const reload = () => {
    invalidateCache(API);
    res.reload();
  };
  const integ = res.data?.integration;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Integração ORION.WMS"
        description="Armazém integrado: o ORION opera o estoque físico; o ATLAS mantém o estoque fiscal pelos eventos do armazém."
        meta={integ ? <Badge tone={STATUS[integ.status]?.tone ?? "neutral"}>{STATUS[integ.status]?.label ?? integ.status}</Badge> : undefined}
      />
      {!canView ? (
        <EmptyState framed kind="no-permission" title="Sem acesso" description="Requer orion.integration.view ou orion.access.manage." />
      ) : res.loading ? (
        <Panel><SkeletonRows rows={6} /></Panel>
      ) : res.error ? (
        <EmptyState framed kind="error" title="Integração indisponível" description={res.error} onRetry={res.reload} />
      ) : !integ ? (
        <Alert tone="info" title="Empresa ainda não vinculada">
          O módulo ORION é contratado e vinculado pela Administração Central da plataforma. Depois do vínculo, configure aqui as etapas, os depósitos e os acessos.
        </Alert>
      ) : (
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">Configuração</TabsTrigger>
            <TabsTrigger value="access">Acessos ao ORION</TabsTrigger>
            <TabsTrigger value="events">Eventos</TabsTrigger>
            <TabsTrigger value="recon">Reconciliação</TabsTrigger>
          </TabsList>
          <TabsContent value="config" className="mt-4 flex flex-col gap-4">
            <StatusPanel data={res.data!} />
            <ConfigPanel data={res.data!} onSaved={reload} />
            <WarehouseMapPanel data={res.data!} onSaved={reload} />
            <InitialLoadPanel data={res.data!} onDone={reload} />
          </TabsContent>
          <TabsContent value="access" className="mt-4">
            <AccessPanel data={res.data!} onChanged={reload} />
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <EventsPanel />
          </TabsContent>
          <TabsContent value="recon" className="mt-4">
            <ReconciliationPanel data={res.data!} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function StatusPanel({ data }: { data: Overview }) {
  const i = data.integration!;
  const rows: Array<[string, string]> = [
    ["URL do ORION", i.orion_url],
    ["Empresa no ORION", i.orion_company_id ?? "—"],
    ["Identificador da chave (key_id)", i.key_id],
    ["Dono do estoque físico", i.stock_owner === "orion" ? "ORION" : "ATLAS"],
    ["Carga inicial", i.cutover_at ? formatDateTime(i.cutover_at) : "não feita"],
    ["Último envio aceito", i.last_outbound_success_at ? formatDateTime(i.last_outbound_success_at) : "—"],
    ["Último evento recebido", i.last_inbound_success_at ? formatDateTime(i.last_inbound_success_at) : "—"],
    ["Fila", `${data.queue.pending} pendente(s) · ${data.queue.failed} com falha${data.queue.oldestPendingAt ? ` · mais antigo ${formatDateTime(data.queue.oldestPendingAt)}` : ""}`],
  ];
  return (
    <Panel>
      <PanelHeader title="Vínculo" description="Dados do vínculo feito pela Administração Central. O segredo nunca é exibido." />
      <PanelBody>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="truncate text-sm font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {data.queue.failed > 0 && <Alert className="mt-3" tone="danger" title="Há eventos com falha">Veja a aba Eventos para reprocessar ou descartar.</Alert>}
      </PanelBody>
    </Panel>
  );
}

function ConfigPanel({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { can } = useSession();
  const i = data.integration!;
  const canManage = can("orion.integration.manage");
  const [form, setForm] = useState({
    salesReleaseStatus: i.sales_release_status,
    purchaseReleaseStatus: i.purchase_release_status,
    productionReleaseStatus: i.production_release_status,
    autoSend: i.auto_send,
    requireInvoiceBeforeShip: i.require_invoice_before_ship,
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await apiSend(API, "PUT", form);
      toast.success("Configuração salva e enviada ao ORION.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel>
      <PanelHeader title="Envio de documentos" description="Em que etapa cada documento vai ao armazém e se a expedição espera a NF-e." />
      <PanelBody className="grid gap-4 md:grid-cols-3">
        <FormField label="Pedido de venda vai ao ORION quando">
          <Select disabled={!canManage} value={form.salesReleaseStatus} onValueChange={(v) => setForm({ ...form, salesReleaseStatus: v as typeof form.salesReleaseStatus })}
            options={[{ value: "approved", label: "Aprovado" }, { value: "reserved", label: "Liberado para separação" }]} />
        </FormField>
        <FormField label="Pedido de compra vira recebimento previsto quando">
          <Select disabled={!canManage} value={form.purchaseReleaseStatus} onValueChange={(v) => setForm({ ...form, purchaseReleaseStatus: v as typeof form.purchaseReleaseStatus })}
            options={[{ value: "approved", label: "Aprovado" }, { value: "sent", label: "Enviado ao fornecedor" }]} />
        </FormField>
        <FormField label="Ordem de produção vira requisição quando">
          <Select disabled={!canManage} value={form.productionReleaseStatus} onValueChange={(v) => setForm({ ...form, productionReleaseStatus: v as typeof form.productionReleaseStatus })}
            options={[{ value: "planned", label: "Planejada" }, { value: "released", label: "Liberada" }]} />
        </FormField>
        <label className="flex items-center gap-3 text-sm">
          <Switch disabled={!canManage} checked={form.autoSend} onCheckedChange={(v) => setForm({ ...form, autoSend: v })} />
          Enviar automaticamente na etapa configurada
        </label>
        <label className="flex items-center gap-3 text-sm md:col-span-2">
          <Switch disabled={!canManage} checked={form.requireInvoiceBeforeShip} onCheckedChange={(v) => setForm({ ...form, requireInvoiceBeforeShip: v })} />
          Exigir NF-e autorizada antes da expedição no ORION
        </label>
        {canManage && (
          <div className="md:col-span-3">
            <Button size="sm" loading={saving} onClick={save}>Salvar configuração</Button>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function WarehouseMapPanel({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { can } = useSession();
  const canManage = can("orion.integration.manage") && !data.integration!.cutover_at;
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(data.warehouseMap.map((m) => [m.warehouse_id, m.orion_warehouse_code])));
  const [saving, setSaving] = useState<string | null>(null);
  async function save(warehouseId: string) {
    setSaving(warehouseId);
    try {
      await apiSend(`${API}/warehouses`, "POST", { warehouseId, orionWarehouseCode: codes[warehouseId] ?? "" });
      toast.success("Depósito mapeado. Local ORION-<depósito> criado para o saldo fiscal.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mapear.");
    } finally {
      setSaving(null);
    }
  }
  const mapped = new Set(data.warehouseMap.map((m) => m.warehouse_id));
  return (
    <Panel>
      <PanelHeader title="Depósitos" description="Código do depósito no ORION para cada depósito do ATLAS. Não muda depois da carga inicial." />
      <ul className="divide-y divide-border-subtle">
        {data.warehouses.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Warehouse size={15} className="text-muted-foreground" aria-hidden />
            <span className="min-w-40 text-sm font-medium">{w.code} · {w.name}</span>
            {mapped.has(w.id) && <Badge tone="success">Mapeado</Badge>}
            <Input className="w-40" aria-label={`Código ORION de ${w.code}`} placeholder="DEP-01" disabled={!canManage} value={codes[w.id] ?? ""} onChange={(e) => setCodes({ ...codes, [w.id]: e.target.value })} />
            {canManage && <Button size="sm" variant="secondary" loading={saving === w.id} disabled={!codes[w.id]} onClick={() => save(w.id)}>Salvar</Button>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function InitialLoadPanel({ data, onDone }: { data: Overview; onDone: () => void }) {
  const { can } = useSession();
  const i = data.integration!;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (i.status !== "activating") return null;
  async function run() {
    setBusy(true);
    try {
      await apiSend(`${API}/initial-snapshot`, "POST", {});
      toast.success("Carga inicial enviada. O ORION confirma com o saldo conferido.");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a carga.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <PanelHeader title="Carga inicial de estoque" description="Congela os movimentos físicos no ATLAS, leva o saldo para ORION-<depósito> e envia stock.initial_snapshot. Exige cadastros enviados sem erro, depósitos mapeados e um administrador ORION liberado." />
      <PanelBody>
        {i.cutover_at ? (
          <Alert tone="info" title="Carga enviada">Aguardando a conferência do ORION (stock.balance_snapshot). Diferenças aparecem em Reconciliação.</Alert>
        ) : (
          can("orion.integration.manage") && <Button size="sm" onClick={() => setOpen(true)}>Fazer carga inicial</Button>
        )}
      </PanelBody>
      <ConfirmDialog open={open} title="Fazer a carga inicial?" description="A partir daqui o estoque físico desta empresa só muda pelo ORION. Não pode ser desfeito por esta tela." confirmLabel="Fazer carga" loading={busy} onConfirm={run} onCancel={() => setOpen(false)} />
    </Panel>
  );
}

function AccessPanel({ data, onChanged }: { data: Overview; onChanged: () => void }) {
  const { can } = useSession();
  const canManage = can("orion.access.manage");
  const [grant, setGrant] = useState<{ userId: string; orionRole: string; warehouses: string[] } | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const byUser = useMemo(() => new Map(data.access.map((a) => [a.user_id, a])), [data.access]);
  const codes = data.warehouseMap.map((m) => m.orion_warehouse_code);

  async function submitGrant() {
    if (!grant) return;
    setBusy(true);
    try {
      await apiSend(`${API}/access`, "POST", grant);
      toast.success("Acesso liberado. O funcionário já pode usar Abrir ORION.");
      setGrant(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível liberar.");
    } finally {
      setBusy(false);
    }
  }
  async function submitRevoke() {
    if (!revoke) return;
    setBusy(true);
    try {
      await apiSend(`${API}/access/${revoke}`, "DELETE");
      toast.success("Acesso revogado. A sessão no ORION cai na próxima checagem.");
      setRevoke(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível revogar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Acessos ao ORION" description="Quem entra no ORION com a conta do ATLAS, com qual perfil e em quais depósitos (vazio = todos)." />
      <ul className="divide-y divide-border-subtle">
        {data.users.map((u) => {
          const a = byUser.get(u.id);
          const active = a?.status === "active";
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              {u.status !== "active" && <Badge tone="neutral">Inativo no ATLAS</Badge>}
              {active ? (
                <>
                  <Badge tone="success">{ROLES.find((r) => r.value === a.orion_role)?.label ?? a.orion_role}</Badge>
                  <span className="text-xs text-muted-foreground">{a.warehouses.length ? a.warehouses.join(", ") : "todos os depósitos"} · v{a.version}</span>
                </>
              ) : (
                a && <Badge tone="neutral">Revogado{a.revoke_reason ? ` (${a.revoke_reason})` : ""}</Badge>
              )}
              {canManage && u.status === "active" && (
                <Button size="sm" variant="secondary" onClick={() => setGrant({ userId: u.id, orionRole: a?.orion_role ?? "operator", warehouses: a?.warehouses ?? [] })}>
                  <UserPlus size={14} aria-hidden /> {active ? "Alterar" : "Liberar"}
                </Button>
              )}
              {canManage && active && (
                <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => setRevoke(u.id)}>
                  <ShieldOff size={14} aria-hidden /> Revogar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Dialog
        open={!!grant}
        onOpenChange={(o) => !o && setGrant(null)}
        title="Acesso ao ORION"
        footer={<Button size="sm" loading={busy} onClick={submitGrant}>Salvar acesso</Button>}
      >
        {grant && (
          <div className="flex flex-col gap-4">
            <FormField label="Perfil no ORION">
              <Select value={grant.orionRole} onValueChange={(v) => setGrant({ ...grant, orionRole: v })} options={ROLES} />
            </FormField>
            <FormField label="Depósitos" help="Nenhum marcado = todos os depósitos.">
              <div className="flex flex-wrap gap-3">
                {codes.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={grant.warehouses.includes(c)} onChange={(e) => setGrant({ ...grant, warehouses: e.target.checked ? [...grant.warehouses, c] : grant.warehouses.filter((x) => x !== c) })} />
                    {c}
                  </label>
                ))}
                {codes.length === 0 && <span className="text-xs text-muted-foreground">Mapeie os depósitos na aba Configuração.</span>}
              </div>
            </FormField>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={!!revoke} tone="danger" title="Revogar o acesso ao ORION?" description="O ORION inativa o usuário ao receber o evento; a sessão aberta cai na próxima checagem de acesso." confirmLabel="Revogar" loading={busy} onConfirm={submitRevoke} onCancel={() => setRevoke(null)} />
    </Panel>
  );
}

type EventRow = {
  id?: string; event_id?: string; event_type: string; aggregate_type: string; aggregate_id: string; aggregate_seq: number | null;
  status: string; attempts: number; last_error: string | null; last_http_status?: number | null; created_at?: string; received_at?: string;
  payload: unknown;
};

function EventsPanel() {
  const { can } = useSession();
  const canManage = can("orion.integration.manage");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [status, setStatus] = useState("");
  const path = `${API}/events?direction=${direction}${status ? `&status=${status}` : ""}`;
  const res = useCached<EventRow[]>(path);
  const [detail, setDetail] = useState<EventRow | null>(null);
  const [discard, setDiscard] = useState<EventRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = () => {
    invalidateCache(`${API}/events`);
    res.reload();
  };
  async function act(row: EventRow, action: "retry" | "discard" | "reprocess", body?: unknown) {
    setBusy(true);
    try {
      await apiSend(`${API}/events/${row.id ?? row.event_id}/${action}`, "POST", body ?? {});
      toast.success(action === "discard" ? "Evento descartado." : "Evento reenfileirado.");
      setDiscard(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <PanelHeader
        title="Eventos"
        description="Saída (ATLAS → ORION) e entrada (ORION → ATLAS), com o id do evento para correlação nos dois lados."
        actions={
          <div className="flex items-center gap-2">
            <Segmented label="Sentido" value={direction} onChange={setDirection} options={[{ value: "out", label: "Saída" }, { value: "in", label: "Entrada" }]} />
            <Select size="sm" value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}
              options={[{ value: "all", label: "Todos" }, { value: "pending", label: "Pendentes" }, { value: "failed", label: "Com falha" }, { value: "sent", label: "Enviados" }, { value: "applied", label: "Aplicados" }, { value: "discarded", label: "Descartados" }]} />
            <Button size="icon-sm" variant="ghost" aria-label="Atualizar" onClick={reload}><RefreshCw size={14} /></Button>
          </div>
        }
      />
      {res.loading ? <SkeletonRows rows={6} /> : res.error ? <EmptyState kind="error" title="Eventos indisponíveis" description={res.error} /> : (res.data ?? []).length === 0 ? (
        <EmptyState title="Nenhum evento" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Documento</th><th className="px-4 py-2">Seq.</th><th className="px-4 py-2">Situação</th><th className="px-4 py-2">Tentativas</th><th className="px-4 py-2">Quando</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {res.data!.map((e) => (
                <tr key={e.id ?? e.event_id}>
                  <td className="px-4 py-2 font-mono text-xs"><button className="underline-offset-4 hover:underline" onClick={() => setDetail(e)}>{e.event_type}</button></td>
                  <td className="px-4 py-2 font-mono text-xs">{e.aggregate_type} · {e.aggregate_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 tabular-nums">{e.aggregate_seq ?? "—"}</td>
                  <td className="px-4 py-2"><Badge tone={["sent", "applied"].includes(e.status) ? "success" : e.status === "failed" ? "danger" : "neutral"}>{e.status}</Badge>{e.last_error && <p className="mt-1 max-w-80 truncate text-xs text-danger-fg" title={e.last_error}>{e.last_error}</p>}</td>
                  <td className="px-4 py-2 tabular-nums">{e.attempts}</td>
                  <td className="px-4 py-2 tabular-nums text-xs">{formatDateTime(e.created_at ?? e.received_at ?? "")}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {canManage && direction === "out" && ["failed", "pending"].includes(e.status) && (
                      <>
                        <Button size="xs" variant="secondary" disabled={busy} onClick={() => act(e, "retry")}>Reprocessar</Button>{" "}
                        <Button size="xs" variant="ghost" disabled={busy} onClick={() => { setReason(""); setDiscard(e); }}>Descartar</Button>
                      </>
                    )}
                    {canManage && direction === "in" && e.status === "failed" && <Button size="xs" variant="secondary" disabled={busy} onClick={() => act(e, "reprocess")}>Reprocessar</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)} title={detail?.event_type ?? ""} description={detail ? `id ${detail.id ?? detail.event_id}` : undefined} size="lg">
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-surface-sunken p-3 text-xs">{JSON.stringify(detail?.payload, null, 2)}</pre>
      </Dialog>
      <Dialog open={!!discard} onOpenChange={(o) => !o && setDiscard(null)} title="Descartar evento" footer={<Button size="sm" variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => discard && act(discard, "discard", { reason })}>Descartar</Button>}>
        <FormField label="Motivo" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
      </Dialog>
    </Panel>
  );
}

type Recon = {
  runs: Array<{ id: string; snapshot_id: string; reason: string; taken_at: string; status: string; total_items: number; divergent_items: number; created_at: string }>;
  runId: string | null;
  items: Array<{ product_id: string; product_code: string | null; product_name: string | null; lot_code: string | null; warehouse_id: string; atlas_qty: number; orion_qty: number; delta: number }>;
};

function ReconciliationPanel({ data }: { data: Overview }) {
  const [run, setRun] = useState<string | null>(null);
  const path = `${API}/reconciliation${run ? `?run=${run}` : ""}`;
  const res = useCached<Recon>(path);
  const whName = new Map(data.warehouses.map((w) => [w.id, w.code]));
  const runs = res.data?.runs ?? [];
  const twoDays = runs.length >= 2 && runs[0].divergent_items > 0 && runs[1].divergent_items > 0;
  return (
    <Panel>
      <PanelHeader
        title="Reconciliação de estoque"
        description="Saldo físico do ORION (stock.balance_snapshot) contra o saldo fiscal do ATLAS. Corrija sempre pelo ORION (inventário ou ajuste)."
        actions={res.data?.runId ? <a className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline" href={`${API}/reconciliation?run=${res.data.runId}&format=csv`}><Download size={14} aria-hidden /> CSV</a> : undefined}
      />
      <PanelBody className="flex flex-col gap-3">
        {twoDays && <Alert tone="danger" title="Diferenças em duas reconciliações seguidas">Verifique eventos com falha e faça inventário no ORION.</Alert>}
        {runs.length > 0 && (
          <Select value={res.data?.runId ?? ""} onValueChange={setRun} options={runs.map((r) => ({ value: r.id, label: `${formatDateTime(r.taken_at ?? r.created_at)} · ${r.reason} · ${r.status === "waiting_events" ? "aguardando eventos" : `${r.divergent_items} de ${r.total_items} com diferença`}` }))} />
        )}
        {res.loading ? <SkeletonRows rows={4} /> : runs.length === 0 ? <EmptyState title="Nenhuma reconciliação recebida" /> : (res.data?.items.length ?? 0) === 0 ? (
          <Alert tone="success" title="Sem diferenças">ATLAS e ORION conferem.</Alert>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Produto</th><th>Lote</th><th>Depósito</th><th className="text-right">ATLAS</th><th className="text-right">ORION</th><th className="text-right">Diferença</th></tr></thead>
            <tbody className="divide-y divide-border-subtle">
              {res.data!.items.map((i, k) => (
                <tr key={k}><td className="py-2">{i.product_code} {i.product_name}</td><td>{i.lot_code ?? "—"}</td><td>{whName.get(i.warehouse_id) ?? i.warehouse_id.slice(0, 8)}</td><td className="text-right tabular-nums">{Number(i.atlas_qty)}</td><td className="text-right tabular-nums">{Number(i.orion_qty)}</td><td className="text-right tabular-nums font-medium">{Number(i.delta)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </PanelBody>
    </Panel>
  );
}
