"use client";

import { useState } from "react";
import { Link2, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Select, Switch } from "@/components/ui/Controls";
import { Alert, EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { formatDateTime } from "@/lib/format";
import { companyRef, platformSend, type PlatformCompany } from "@/components/platform/data";

// Administração Central › ORION.WMS (§6.1 passos 1 e 4): contrata o módulo
// para a empresa e faz o vínculo com o ORION (POST /links com a credencial
// de instalação). O segredo HMAC é gerado aqui, enviado ao ORION uma vez e
// guardado cifrado; nunca é exibido. "Rotacionar segredo" repete o vínculo
// com um segredo novo (o anterior vale por 24 h).

type OrionStatus = {
  module: { contracted: boolean; enabled_by_company: boolean } | null;
  integration: null | {
    status: string; orion_url: string; orion_company_id: string | null; key_id: string; stock_owner: string;
    cutover_at: string | null; last_outbound_success_at: string | null; last_inbound_success_at: string | null;
    activated_at: string | null; previous_secret_expires_at: string | null;
  };
  defaultOrionUrl: string | null;
  installConfigured: boolean;
  queue: { pending: number; failed: number };
};

export default function PlatformOrionPage() {
  const { canPlatform } = useSession();
  const companies = useCached<PlatformCompany[]>("/api/platform/companies", canPlatform("platform.companies.view"));
  const [companyId, setCompanyId] = useState<string>("");
  const list = (companies.data ?? []).filter((c) => c.company_kind !== "study");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ORION.WMS" description="Contratação do armazém integrado e vínculo de cada empresa com a instalação do ORION." />
      {companies.loading ? (
        <Panel><SkeletonRows rows={4} /></Panel>
      ) : companies.error ? (
        <EmptyState framed kind="error" title="Empresas indisponíveis" description={companies.error} onRetry={companies.reload} />
      ) : (
        <>
          <Panel>
            <PanelBody>
              <FormField label="Empresa">
                <Select value={companyId} onValueChange={setCompanyId} placeholder="Selecione a empresa" options={list.map((c) => ({ value: c.company_id, label: companyRef(c.company_id, c.display_name) }))} />
              </FormField>
            </PanelBody>
          </Panel>
          {companyId && <CompanyOrion key={companyId} companyId={companyId} />}
        </>
      )}
    </div>
  );
}

function CompanyOrion({ companyId }: { companyId: string }) {
  const { canPlatform } = useSession();
  const res = useCached<OrionStatus>(`/api/platform/companies/${companyId}/orion`);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage = canPlatform("platform.modules.manage") || canPlatform("platform.company_modules.manage");
  if (res.loading) return <Panel><SkeletonRows rows={4} /></Panel>;
  if (res.error || !res.data) return <EmptyState framed kind="error" title="Indisponível" description={res.error ?? ""} onRetry={res.reload} />;
  const d = res.data;
  const contracted = !!d.module?.contracted;
  const orionUrl = url || d.integration?.orion_url || d.defaultOrionUrl || "";

  async function setContracted(next: boolean) {
    setBusy(true);
    try {
      await platformSend(`/api/platform/companies/${companyId}/modules`, "POST", { moduleCode: "orion", contracted: next });
      toast.success(next ? "ORION contratado. O admin da empresa habilita em Módulos." : "ORION descontratado.");
      res.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar.");
    } finally {
      setBusy(false);
    }
  }
  async function link() {
    setBusy(true);
    try {
      const r = await platformSend<{ rotated: boolean }>(`/api/platform/companies/${companyId}/orion`, "POST", { orionUrl });
      toast.success(r.rotated ? "Segredo rotacionado e enviado ao ORION." : "Empresa vinculada ao ORION. Cadastros em envio.");
      res.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível vincular.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Integração"
        actions={d.integration ? <Badge tone={d.integration.status === "active" ? "success" : d.integration.status === "suspended" ? "danger" : "warning"}>{d.integration.status}</Badge> : <Badge>Não vinculada</Badge>}
      />
      <PanelBody className="flex flex-col gap-4">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={contracted} disabled={!canManage || busy} onCheckedChange={setContracted} />
          Módulo ORION contratado {d.module && !d.module.enabled_by_company && contracted && <Badge tone="warning">aguardando habilitação pela empresa</Badge>}
        </label>
        {!d.installConfigured && <Alert tone="warning" title="Credencial de instalação ausente">Defina ORION_INSTALL_KEY_ID e ORION_INSTALL_SECRET nesta instalação para vincular empresas.</Alert>}
        <FormField label="URL do ORION" help="Base da instalação do ORION (padrão: ORION_URL).">
          <Input value={orionUrl} disabled={!canManage} onChange={(e) => setUrl(e.target.value)} placeholder="https://orion.exemplo.com.br" />
        </FormField>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" disabled={!contracted || !d.installConfigured || !orionUrl} loading={busy} onClick={link}>
              {d.integration ? <><RotateCw size={14} aria-hidden /> Rotacionar segredo / revincular</> : <><Link2 size={14} aria-hidden /> Vincular ao ORION</>}
            </Button>
          </div>
        )}
        {d.integration && (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Empresa no ORION</dt><dd className="font-mono text-xs">{d.integration.orion_company_id ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">key_id</dt><dd className="font-mono text-xs">{d.integration.key_id}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Carga inicial</dt><dd>{d.integration.cutover_at ? formatDateTime(d.integration.cutover_at) : "não feita"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Último envio aceito</dt><dd>{d.integration.last_outbound_success_at ? formatDateTime(d.integration.last_outbound_success_at) : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Último evento recebido</dt><dd>{d.integration.last_inbound_success_at ? formatDateTime(d.integration.last_inbound_success_at) : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fila</dt><dd>{d.queue.pending} pendente(s) · {d.queue.failed} com falha</dd></div>
            {d.integration.previous_secret_expires_at && <div><dt className="text-xs text-muted-foreground">Segredo anterior válido até</dt><dd>{formatDateTime(d.integration.previous_secret_expires_at)}</dd></div>}
          </dl>
        )}
      </PanelBody>
    </Panel>
  );
}
