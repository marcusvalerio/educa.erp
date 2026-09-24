"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { AuthFrame, AuthHeading } from "@/components/auth/AuthFrame";
import { buildRecoveryCallbackUrl, recoverPasswordSchema } from "@/lib/onboarding/invitations";

// Esqueci minha senha → e-mail → link → nova senha → login.
// A resposta é SEMPRE a mesma, exista ou não uma conta para o e-mail:
// esta tela não serve para descobrir quem tem acesso.
export function RecoverPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = recoverPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Informe um e-mail válido.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await createClient().auth.resetPasswordForEmail(parsed.data.email, { redirectTo: buildRecoveryCallbackUrl(window.location.origin) });
    } catch {
      // Falha de rede/limite: mesma resposta (sem enumeração de contas).
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <AuthFrame>
      {sent ? (
        <div className="flex flex-col gap-6">
          <AuthHeading
            icon={<MailCheck size={18} aria-hidden />}
            tone="success"
            title="Verifique seu e-mail"
            description="Se houver um acesso para este e-mail, você receberá em instantes um link para criar uma nova senha. O link vale por tempo limitado e só pode ser usado uma vez."
          />
          <p className="text-xs text-subtle-foreground">Não recebeu? Confira a caixa de spam ou tente novamente em alguns minutos.</p>
          <Button asChild variant="secondary" className="w-full justify-center">
            <Link href="/login">
              <ArrowLeft size={14} aria-hidden /> Voltar ao login
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <AuthHeading icon={<KeyRound size={18} aria-hidden />} title="Recuperar senha" description="Informe o e-mail do seu acesso. Enviaremos um link para você criar uma nova senha." />
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <FormField label="E-mail" required error={error ?? undefined}>
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com.br" autoFocus />
            </FormField>
            <Button type="submit" loading={loading} disabled={!email} className="w-full justify-center">
              {loading ? "Enviando..." : "Enviar link"}
            </Button>
          </form>
          <Link href="/login" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft size={13} aria-hidden /> Voltar ao login
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}
