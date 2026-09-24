"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LinkIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { AuthFrame, AuthHeading } from "@/components/auth/AuthFrame";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { consumeAuthHash } from "@/lib/onboarding/auth-hash";
import { newPasswordSchema } from "@/lib/onboarding/invitations";
import { postLoginDestination } from "@/lib/onboarding/access";
import { clearClientSessionState, primeSession } from "@/lib/session/client-state";
import type { SessionContext } from "@/lib/session/types";

// Nova senha, a partir de uma sessão de recuperação (link do e-mail,
// trocado em /auth/callback) ou de primeiro acesso (convite do Auth
// para membro da plataforma, sessão no fragmento da URL).
//   recuperação     → grava a senha, encerra a sessão, volta ao login;
//   primeiro acesso → grava a senha e segue para o ambiente da pessoa.
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firstAccess = searchParams.get("primeiro-acesso") === "1";
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const fromHash = await consumeAuthHash(supabase);
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (fromHash.error || !data.user) {
        setLinkError(fromHash.error);
        setPhase("invalid");
        return;
      }
      setEmail(data.user.email ?? null);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password, data: { educa_password_pending: false } });
      if (error) {
        setErrors({
          form: /different from the old|same_password/i.test(error.message + (error.code ?? ""))
            ? "A nova senha precisa ser diferente da anterior."
            : /weak|pwned/i.test(error.message + (error.code ?? ""))
              ? "Esta senha é fraca ou conhecida em vazamentos. Escolha outra."
              : "Não foi possível salvar a senha. O link pode ter expirado — solicite um novo.",
        });
        return;
      }
      if (firstAccess) {
        const res = await fetch("/api/session/context", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.success) {
          const context = body.data as SessionContext;
          primeSession(context);
          router.replace(postLoginDestination(context, searchParams.get("next")));
          return;
        }
        router.replace("/acesso");
        return;
      }
      // Recuperação: encerra a sessão de recuperação e volta ao login.
      await supabase.auth.signOut();
      clearClientSessionState();
      router.replace("/login?reset=ok");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthFrame>
      {phase === "checking" ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Validando link">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : phase === "invalid" ? (
        <div className="flex flex-col gap-6">
          <AuthHeading
            icon={<LinkIcon size={18} aria-hidden />}
            tone="warning"
            title="Link inválido ou expirado"
            description={linkError ?? "Este link de senha não é mais válido. Links de recuperação expiram e só podem ser usados uma vez."}
          />
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full justify-center">
              <Link href="/recuperar-senha">Solicitar novo link</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full justify-center">
              <Link href="/login">Voltar ao login</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <AuthHeading
            icon={<KeyRound size={18} aria-hidden />}
            title={firstAccess ? "Crie sua senha" : "Defina uma nova senha"}
            description={
              <>
                {firstAccess ? "Primeiro acesso de " : "Nova senha para "}
                <span className="font-medium text-foreground">{email}</span>.
              </>
            }
          />
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            {errors.form && <Alert tone="danger">{errors.form}</Alert>}
            <FormField label="Nova senha" required error={errors.password} help="Mínimo de 8 caracteres, com letras e números.">
              <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} />
            </FormField>
            <FormField label="Confirme a senha" required error={errors.confirm}>
              <PasswordInput autoComplete="new-password" value={confirm} onChange={setConfirm} />
            </FormField>
            <Button type="submit" loading={saving} disabled={!password || !confirm} className="w-full justify-center">
              {firstAccess ? "Criar senha e continuar" : "Salvar nova senha"}
            </Button>
          </form>
        </div>
      )}
    </AuthFrame>
  );
}
