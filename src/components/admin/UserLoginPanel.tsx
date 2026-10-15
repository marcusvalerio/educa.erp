"use client";

import { useState } from "react";
import { Ban, Copy, KeyRound, MailPlus, Power, RotateCcw } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Feedback";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { formatDateTime } from "@/lib/format";
import { userAccessStatus, type UserAccessStatus } from "@/lib/onboarding/invitations";
import { temporaryPasswordAvailable } from "@/lib/auth/client";
import { adminSend, type AdminInvitation, type AdminUser } from "./data";

// Acesso ao sistema de um cadastro: convite (enviar, reenviar, cancelar),
// situação do login e ativação. O banco decide tudo:
//   convite  → fn_create_user_invitation / fn_revoke_user_invitation
//              (users.update na empresa do cadastro, auditado);
//   ativação → /api/users/:id (users.update; o gatilho do banco protege o
//              último administrador ativo).
// Nenhuma tela escolhe empresa, login (auth_user_id) ou papel aqui.

export const ACCESS_STATUS_META: Record<UserAccessStatus, { label: string; tone: Tone }> = {
  active: { label: "Conta ativa", tone: "success" },
  invite_pending: { label: "Convite pendente", tone: "info" },
  invite_expired: { label: "Convite expirado", tone: "warning" },
  no_login: { label: "Sem login", tone: "neutral" },
  inactive: { label: "Desativado", tone: "danger" },
};

type InviteResult = { email: string; expiresAt: string; inviteUrl: string; emailSent: boolean; deliveryNote: string | null };
type TemporaryPasswordResult = { password: string; email: string; expiresAt: string };

export function AccessStatusBadge({ status }: { status: UserAccessStatus }) {
  const meta = ACCESS_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

export function UserLoginPanel({ user, invitation, onChanged }: { user: AdminUser; invitation: AdminInvitation | null; onChanged: () => void }) {
  const { can, data: session } = useSession();
  const canUpdate = can("users.update");
  const isSelf = session?.tenant?.user.id === user.id;
  const status = userAccessStatus(user, invitation);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [confirm, setConfirm] = useState<"revoke" | "deactivate" | "activate" | "temporary" | "revokeTemporary" | null>(null);
  // Senha provisória (0095, só Neon Auth): mostrada uma única vez, nunca guardada.
  const [temporary, setTemporary] = useState<TemporaryPasswordResult | null>(null);
  const canTemporary = temporaryPasswordAvailable() && canUpdate && !isSelf && user.status === "active";

  async function issueTemporary() {
    setBusy("temporary");
    try {
      const res = await adminSend<TemporaryPasswordResult>(`/api/admin/users/${user.id}/temporary-password`, "POST", {});
      setTemporary(res);
      setResult(null);
      setConfirm(null);
      toast.success("Senha provisória gerada.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a senha provisória.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeTemporary() {
    setBusy("revokeTemporary");
    try {
      const res = await adminSend<{ revoked: boolean }>(`/api/admin/users/${user.id}/temporary-password`, "DELETE");
      setTemporary(null);
      setConfirm(null);
      toast.success(res.revoked ? "Senha provisória revogada." : "Não havia senha provisória pendente.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revogar.");
    } finally {
      setBusy(null);
    }
  }

  async function invite() {
    setBusy("invite");
    try {
      const res = await adminSend<InviteResult>(`/api/admin/users/${user.id}/invitation`, "POST", {});
      setResult(res);
      toast.success(res.emailSent ? `Convite enviado para ${res.email}.` : "Convite criado.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o convite.");
    } finally {
      setBusy(null);
    }
  }

  async function run(kind: "revoke" | "deactivate" | "activate") {
    setBusy(kind);
    try {
      if (kind === "revoke" && invitation) await adminSend(`/api/admin/invitations/${invitation.id}`, "DELETE");
      if (kind === "deactivate") await adminSend(`/api/users/${user.id}`, "PATCH", { status: "Inativo" });
      if (kind === "activate") await adminSend(`/api/users/${user.id}`, "PATCH", { status: "Ativo" });
      toast.success(kind === "revoke" ? "Convite cancelado." : kind === "deactivate" ? `${user.name} foi desativado.` : `${user.name} foi reativado.`);
      setConfirm(null);
      setResult(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(url: string, what = "Link") {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${what} copiado.`);
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  const description: Record<UserAccessStatus, string> = {
    active: "Este cadastro tem login vinculado e acessa a empresa conforme os papéis e unidades abaixo.",
    invite_pending: invitation ? `Convite enviado para ${invitation.email}, válido até ${formatDateTime(invitation.expires_at)}. O acesso começa quando a pessoa aceitar.` : "",
    invite_expired: "O último convite passou da validade sem ser aceito. Envie um novo.",
    no_login: "Este cadastro ainda não tem login. Envie um convite para o e-mail cadastrado — só essa pessoa poderá aceitá-lo.",
    inactive: "Cadastro desativado: não entra no sistema, mesmo com login vinculado. Os dados e o histórico continuam preservados.",
  };

  return (
    <section className="flex flex-col gap-3 border-b border-border pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Acesso ao sistema</h3>
          <p className="text-xs text-muted-foreground">{description[status]}</p>
        </div>
        <AccessStatusBadge status={status} />
      </div>

      {result && (
        <Alert tone={result.emailSent ? "success" : "warning"} title={result.emailSent ? "Convite enviado" : "Convite criado — envie o link"}>
          <p>{result.emailSent ? `A pessoa recebe o link em ${result.email}. Ele vale até ${formatDateTime(result.expiresAt)} e só pode ser usado uma vez.` : result.deliveryNote}</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={result.inviteUrl} aria-label="Link do convite" className="code text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="secondary" onClick={() => copy(result.inviteUrl)}>
              <Copy size={14} aria-hidden /> Copiar
            </Button>
          </div>
        </Alert>
      )}

      {temporary && (
        <Alert tone="warning" title="Senha provisória — anote agora">
          <p>
            Entregue esta senha a {user.name} por um canal seguro (pessoalmente ou mensagem direta). Ela vale até {formatDateTime(temporary.expiresAt)}, só
            serve para o primeiro acesso de {temporary.email} e <strong>não será mostrada de novo</strong>. No primeiro login a pessoa cria a própria senha.
          </p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={temporary.password} aria-label="Senha provisória" className="code text-sm tracking-wide" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="secondary" onClick={() => copy(temporary.password, "Senha")}>
              <Copy size={14} aria-hidden /> Copiar
            </Button>
          </div>
        </Alert>
      )}

      {canUpdate ? (
        <div className="flex flex-wrap gap-2">
          {canTemporary && (
            <Button size="sm" variant="secondary" loading={busy === "temporary"} disabled={busy !== null} onClick={() => setConfirm("temporary")}>
              <KeyRound size={14} aria-hidden /> Gerar senha provisória
            </Button>
          )}
          {canTemporary && (
            <Button size="sm" variant="ghost" loading={busy === "revokeTemporary"} disabled={busy !== null} onClick={() => setConfirm("revokeTemporary")}>
              <Ban size={14} aria-hidden /> Revogar senha provisória
            </Button>
          )}
          {(status === "no_login" || status === "invite_expired" || status === "invite_pending") && (
            <Button size="sm" loading={busy === "invite"} disabled={busy !== null} onClick={invite}>
              {status === "invite_pending" ? <RotateCcw size={14} aria-hidden /> : <MailPlus size={14} aria-hidden />}
              {status === "invite_pending" ? "Reenviar convite" : "Enviar convite"}
            </Button>
          )}
          {status === "invite_pending" && (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirm("revoke")}>
              <Ban size={14} aria-hidden /> Cancelar convite
            </Button>
          )}
          {user.status === "active" ? (
            <Button size="sm" variant="ghost" disabled={busy !== null || isSelf} title={isSelf ? "Você não pode desativar o próprio acesso." : undefined} onClick={() => setConfirm("deactivate")}>
              <Power size={14} aria-hidden /> Desativar acesso
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirm("activate")}>
              <Power size={14} aria-hidden /> Reativar
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-subtle-foreground">Convidar, gerar senha provisória, desativar e reativar exigem a permissão de edição de usuários.</p>
      )}

      {(confirm === "temporary" || confirm === "revokeTemporary") && (
        <ConfirmDialog
          open
          title={confirm === "temporary" ? `Gerar senha provisória para ${user.name}?` : "Revogar a senha provisória?"}
          description={
            confirm === "temporary"
              ? status === "active"
                ? "A senha atual desta pessoa deixa de valer e as sessões abertas são encerradas. Uma senha provisória anterior também deixa de valer."
                : "A senha aparece uma única vez para você entregar. No primeiro login a pessoa cria a própria senha."
              : "A senha provisória deixa de funcionar imediatamente. Se ela substituiu a senha de uma conta ativa, a pessoa precisará de uma nova senha provisória ou do \"Esqueci minha senha\"."
          }
          confirmLabel={confirm === "temporary" ? "Gerar senha" : "Revogar"}
          tone="danger"
          loading={busy === confirm}
          onConfirm={() => (confirm === "temporary" ? issueTemporary() : revokeTemporary())}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm && confirm !== "temporary" && confirm !== "revokeTemporary" && (
        <ConfirmDialog
          open
          title={confirm === "revoke" ? "Cancelar convite?" : confirm === "deactivate" ? `Desativar ${user.name}?` : `Reativar ${user.name}?`}
          description={
            confirm === "revoke"
              ? "O link enviado deixa de funcionar imediatamente. Você pode enviar um novo convite depois."
              : confirm === "deactivate"
                ? "A pessoa perde o acesso na próxima requisição. O cadastro, os vínculos e o histórico são mantidos."
                : "A pessoa volta a acessar conforme os papéis e unidades atribuídos."
          }
          confirmLabel={confirm === "revoke" ? "Cancelar convite" : confirm === "deactivate" ? "Desativar" : "Reativar"}
          tone={confirm === "activate" ? "default" : "danger"}
          loading={busy === confirm}
          onConfirm={() => run(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
