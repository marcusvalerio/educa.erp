"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileCheck2, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { apiSend } from "@/lib/api-client";
import { invalidateCache } from "@/lib/dashboard/client";

// Emissão da NF-e em modo ensino (homologação, sem valor fiscal) e acesso
// à DANFE/XML. A conferência é do servidor: o que faltar volta como lista.

const ISSUE_PERMS = ["fiscal_documents.authorize", "fiscal_documents.submit_authorization"];

function useIssue(path: string, onDone: (doc: Record<string, unknown>) => void) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    try {
      const doc = await apiSend<Record<string, unknown>>(path, "POST", {});
      invalidateCache("/api/fiscal-documents");
      invalidateCache("/api/sales-orders");
      toast.success("NF-e autorizada (homologação).", "A DANFE e o XML já estão disponíveis.");
      setConfirming(false);
      onDone(doc ?? {});
    } catch (e) {
      setConfirming(false);
      setProblems(e instanceof Error ? e.message : "Não foi possível emitir a nota.");
    } finally {
      setBusy(false);
    }
  }

  const dialogs = (
    <>
      {confirming && (
        <ConfirmDialog
          open
          title="Emitir NF-e (ensino)?"
          description="A nota é numerada, calculada, conferida e autorizada em ambiente de homologação — fiel ao leiaute oficial, sem valor fiscal. Depois de autorizada, os valores não mudam."
          confirmLabel="Emitir NF-e"
          cancelLabel="Voltar"
          loading={busy}
          onConfirm={run}
          onCancel={() => setConfirming(false)}
        />
      )}
      {problems && (
        <Dialog
          open
          onOpenChange={(o) => !o && setProblems(null)}
          title="Nota não emitida"
          description="Corrija os pontos abaixo e emita de novo."
          footer={<Button onClick={() => setProblems(null)}>Entendi</Button>}
        >
          <Alert tone="danger">
            <span className="whitespace-pre-line">{problems}</span>
          </Alert>
          <p className="mt-3 text-sm text-muted-foreground">
            Emitente, naturezas de venda e NCM dos produtos ficam em{" "}
            <Link className="underline" href="/app/fiscal/configuracao">
              Fiscal › Configuração NF-e
            </Link>
            .
          </p>
        </Dialog>
      )}
    </>
  );
  return { open: () => setConfirming(true), busy, dialogs };
}

/** Emite um documento fiscal existente (rascunho, calculado ou conferido). */
export function IssueNfeButton({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const { can } = useSession();
  const issue = useIssue(`/api/fiscal-documents/${documentId}/issue-education`, () => onDone());
  if (!ISSUE_PERMS.every((p) => can(p))) return null;
  return (
    <>
      <Button size="sm" onClick={issue.open} loading={issue.busy}>
        <FileCheck2 size={14} aria-hidden /> Emitir NF-e (ensino)
      </Button>
      {issue.dialogs}
    </>
  );
}

/** Gera a NF-e do pedido e emite em um passo. */
export function IssueOrderNfeButton({ orderId, onDone }: { orderId: string; onDone: (doc: Record<string, unknown>) => void }) {
  const { can } = useSession();
  const issue = useIssue(`/api/sales-orders/${orderId}/issue-nfe-education`, onDone);
  if (![...ISSUE_PERMS, "fiscal_documents.create"].every((p) => can(p))) return null;
  return (
    <>
      <Button size="sm" onClick={issue.open} loading={issue.busy}>
        <FileCheck2 size={14} aria-hidden /> Emitir NF-e
      </Button>
      {issue.dialogs}
    </>
  );
}

/** DANFE e XML de uma nota autorizada. */
export function NfeOutputLinks({ documentId }: { documentId: string }) {
  return (
    <>
      <Button asChild size="sm">
        <Link href={`/app/fiscal/notas-fiscais/${documentId}/danfe`}>
          <FileText size={14} aria-hidden /> Ver DANFE
        </Link>
      </Button>
      <Button asChild size="sm" variant="secondary">
        <a href={`/api/fiscal-documents/${documentId}/xml`} download>
          <Download size={14} aria-hidden /> Baixar XML
        </a>
      </Button>
    </>
  );
}
