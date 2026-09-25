"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Clock, KeyRound, LinkIcon, MailOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { AuthFrame, AuthHeading } from "@/components/auth/AuthFrame";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { currentAccount, setPasswordForCurrentAccount } from "@/lib/auth/client";
import { newPasswordSchema } from "@/lib/onboarding/invitations";
import { primeSession } from "@/lib/session/client-state";
import { formatDateTime } from "@/lib/format";
import type { SessionContext } from "@/lib/session/types";

// Convite → (criar senha) → aceitar → ambiente certo.
//
// A página nunca decide acesso: mostra a prévia do convite (sem ids,
// e-mail mascarado) e, no aceite, manda SÓ o token. O banco confere que
// o login da sessão tem o e-mail do convite, confirmado, e que ele não
// está ligado a outro cadastro — então vincula (auditado).

type Preview = {
  status: "invalid" | "pending" | "accepted" | "revoked" | "expired";
  kind?: "USER" | "COMPANY_ADMIN";
  email_hint?: string | null;
  expires_at?: string;
  company_name?: string | null;
  user_name?: string | null;
};

type Phase =
  | { step: "loading" }
  | { step: "closed"; preview: Preview }
  | { step: "sign-in"; preview: Preview; linkError: string | null }
  | { step: "password"; preview: Preview; email: string }
  | { step: "accept"; preview: Preview; email: string }
  | { step: "accepted"; kind: "USER" | "COMPANY_ADMIN" }
  | { step: "error"; message: string };

export function InvitationFlow({ token }: { token: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ step: "loading" });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Primeiro a conta/link (o fragmento do Supabase sai da URL já), depois a prévia.
        const accountPromise = currentAccount().catch(() => ({ account: null, linkError: null }));
        const res = await fetch(`/api/onboarding/invitations/${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.success) {
          setPhase({ step: "error", message: "Não foi possível consultar o convite agora. Tente novamente em instantes." });
          return;
        }
        const preview = body.data as Preview;
        if (preview.status !== "pending") {
          setPhase({ step: "closed", preview });
          return;
        }
        const { account, linkError } = await accountPromise;
        if (cancelled) return;
        if (!account) {
          setPhase({ step: "sign-in", preview, linkError });
          return;
        }
        setPhase(account.passwordPending ? { step: "password", preview, email: account.email } : { step: "accept", preview, email: account.email });
      } catch {
        if (!cancelled) setPhase({ step: "error", message: "Não foi possível conectar ao servidor. Tente novamente." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  return (
    <AuthFrame>
      {phase.step === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando convite">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {phase.step === "error" && (
        <div className="flex flex-col gap-4">
          <Alert tone="danger" title="Convite indisponível">
            {phase.message}
          </Alert>
          <Button variant="secondary" size="sm" className="w-fit" onClick={() => { setPhase({ step: "loading" }); setAttempt((n) => n + 1); }}>
            Tentar novamente
          </Button>
        </div>
      )}
      {phase.step === "closed" && <ClosedInvitation preview={phase.preview} />}
      {phase.step === "sign-in" && <SignInStep token={token} preview={phase.preview} linkError={phase.linkError} />}
      {phase.step === "password" && (
        <PasswordStep preview={phase.preview} email={phase.email} onDone={() => setPhase({ step: "accept", preview: phase.preview, email: phase.email })} />
      )}
      {phase.step === "accept" && (
        <AcceptStep
          token={token}
          preview={phase.preview}
          email={phase.email}
          onAccepted={async (kind) => {
            setPhase({ step: "accepted", kind });
            // Contexto novo (vínculo recém-criado) para o shell, sem nova chamada.
            const res = await fetch("/api/session/context", { cache: "no-store" });
            const body = await res.json().catch(() => null);
            if (res.ok && body?.success) primeSession(body.data as SessionContext);
            router.replace(kind === "COMPANY_ADMIN" ? "/admin" : "/");
          }}
        />
      )}
      {phase.step === "accepted" && (
        <AuthHeading
          icon={<CheckCircle2 size={18} aria-hidden />}
          tone="success"
          title="Conta ativa"
          description={phase.kind === "COMPANY_ADMIN" ? "Acesso liberado. Abrindo a Administração da Empresa…" : "Acesso liberado. Abrindo o EDUCA…"}
        />
      )}
    </AuthFrame>
  );
}

function InvitationSummary({ preview }: { preview: Preview }) {
  const rows: Array<[string, ReactNode]> = [
    ["Organização", preview.company_name ?? "—"],
    ["Convidado", preview.user_name ?? "—"],
    ["E-mail", preview.email_hint ?? "—"],
    ["Acesso", preview.kind === "COMPANY_ADMIN" ? "Administrador da empresa" : "Usuário"],
    ["Válido até", preview.expires_at ? formatDateTime(preview.expires_at) : "—"],
  ];
  return (
    <dl className="divide-y divide-border rounded-md border border-border bg-surface text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClosedInvitation({ preview }: { preview: Preview }) {
  const copy = {
    invalid: { icon: <LinkIcon size={18} aria-hidden />, title: "Convite inválido", text: "Este link de convite não existe. Confira se ele foi copiado por inteiro ou peça um novo ao administrador da sua organização." },
    expired: { icon: <Clock size={18} aria-hidden />, title: "Convite expirado", text: "Este convite passou da validade. Peça ao administrador da sua organização que envie um novo." },
    revoked: { icon: <Ban size={18} aria-hidden />, title: "Convite cancelado", text: "Este convite foi cancelado pelo administrador. Se ainda precisa de acesso, peça um novo convite." },
    accepted: { icon: <CheckCircle2 size={18} aria-hidden />, title: "Convite já utilizado", text: "Este convite já foi aceito. Entre com o seu e-mail e senha." },
    pending: { icon: null, title: "", text: "" },
  }[preview.status];
  return (
    <div className="flex flex-col gap-6">
      <AuthHeading icon={copy.icon} tone={preview.status === "accepted" ? "success" : "warning"} title={copy.title} description={copy.text} />
      <Button asChild variant={preview.status === "accepted" ? "primary" : "secondary"} className="w-full justify-center">
        <Link href="/login">Ir para o login</Link>
      </Button>
    </div>
  );
}

function SignInStep({ token, preview, linkError }: { token: string; preview: Preview; linkError: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        icon={<MailOpen size={18} aria-hidden />}
        title="Você recebeu um convite"
        description={<>Para acessar <span className="font-medium text-foreground">{preview.company_name}</span> no EDUCA, confirme sua identidade.</>}
      />
      {linkError && <Alert tone="warning">{linkError}</Alert>}
      <InvitationSummary preview={preview} />
      <div className="flex flex-col gap-2">
        <Button asChild className="w-full justify-center">
          <Link href={`/login?next=${encodeURIComponent(`/convite/${token}`)}`}>Já tenho senha — entrar</Link>
        </Button>
        <p className="text-xs text-subtle-foreground">
          Primeiro acesso? Abra o convite pelo link enviado para o seu e-mail ({preview.email_hint}) — ele leva você a criar a sua senha. O convite só vale para esse e-mail.
        </p>
      </div>
    </div>
  );
}

function PasswordStep({ preview, email, onDone }: { preview: Preview; email: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = newPasswordSchema.safeParse(password);
    const found: typeof errors = {};
    if (!parsed.success) found.password = parsed.error.issues[0]?.message;
    if (password !== confirm) found.confirm = "As senhas não conferem.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const result = await setPasswordForCurrentAccount(password);
      if (!result.ok) {
        setErrors({ form: result.message });
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        icon={<KeyRound size={18} aria-hidden />}
        title="Primeiro acesso"
        description={<>Crie a senha de <span className="font-medium text-foreground">{email}</span> para acessar {preview.company_name}.</>}
      />
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <FormField label="Senha" required error={errors.password} help="Mínimo de 8 caracteres, com letras e números.">
          <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} />
        </FormField>
        <FormField label="Confirme a senha" required error={errors.confirm}>
          <PasswordInput autoComplete="new-password" value={confirm} onChange={setConfirm} />
        </FormField>
        <Button type="submit" loading={saving} disabled={!password || !confirm} className="w-full justify-center">
          Criar senha
        </Button>
      </form>
    </div>
  );
}

function AcceptStep({ token, preview, email, onAccepted }: { token: string; preview: Preview; email: string; onAccepted: (kind: "USER" | "COMPANY_ADMIN") => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setError(body?.error?.message ?? "Não foi possível aceitar o convite.");
        return;
      }
      onAccepted((body.data?.kind as "USER" | "COMPANY_ADMIN") ?? "USER");
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        icon={<ShieldCheck size={18} aria-hidden />}
        title="Aceitar convite"
        description={<>Ao aceitar, o login <span className="font-medium text-foreground">{email}</span> passa a acessar {preview.company_name} com as permissões definidas pelo administrador.</>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <InvitationSummary preview={preview} />
      <div className="flex flex-col gap-2">
        <Button onClick={accept} loading={busy} className="w-full justify-center">
          Aceitar e continuar
        </Button>
        <div className="flex justify-center">
          <LogoutButton label="Não sou eu — sair" />
        </div>
      </div>
    </div>
  );
}
