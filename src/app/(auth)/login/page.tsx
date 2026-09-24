"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { postLoginDestination } from "@/lib/onboarding/access";
import { authLinkLandingPath } from "@/lib/onboarding/auth-hash";
import { primeSession } from "@/lib/session/client-state";
import type { SessionContext } from "@/lib/session/types";

const NOTICES: Record<string, { tone: "success" | "info" | "warning"; text: string }> = {
  saiu: { tone: "info", text: "Você saiu da sua conta." },
  "senha-alterada": { tone: "success", text: "Senha definida. Entre com a nova senha." },
  link: { tone: "warning", text: "O link expirou ou já foi usado. Solicite um novo." },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Link de senha do Supabase que caiu no Site URL (ver authLinkLandingPath):
  // leva o fragmento, sem abri-lo aqui, para a página que o trata.
  useEffect(() => {
    const target = authLinkLandingPath(window.location.hash);
    if (target) window.location.replace(target + window.location.hash);
  }, []);

  const notice = searchParams.get("saiu") ? NOTICES.saiu : searchParams.get("reset") === "ok" ? NOTICES["senha-alterada"] : searchParams.get("erro") === "link" ? NOTICES.link : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(
          signInError.code === "email_not_confirmed"
            ? "Confirme o seu e-mail pelo link recebido antes de entrar."
            : "E-mail ou senha inválidos. Confira os dados e tente novamente."
        );
        return;
      }
      // Primeiro login e seguintes: o servidor resolve o contexto (vínculo,
      // status, empresa, plataforma) e a tela de destino sai dele. A
      // resposta é reaproveitada pelo shell — sem segunda chamada.
      const res = await fetch("/api/session/context", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        router.replace("/acesso");
        return;
      }
      const context = body.data as SessionContext;
      primeSession(context);
      router.replace(postLoginDestination(context, searchParams.get("next")));
    } catch {
      setError("Não foi possível conectar ao servidor de autenticação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <FormField label="E-mail" required>
        <Input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@empresa.com.br"
          autoFocus
        />
      </FormField>
      <FormField
        label="Senha"
        required
        labelAction={
          <Link href="/recuperar-senha" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Esqueci minha senha
          </Link>
        }
      >
        <PasswordInput autoComplete="current-password" value={password} onChange={setPassword} />
      </FormField>
      <Button type="submit" loading={loading} disabled={!email || !password} className="mt-1 w-full justify-center">
        {!loading && <LogIn size={15} />}
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthFrame
      aside={
        <aside className="relative hidden overflow-hidden border-l border-platform-border bg-platform text-platform-foreground lg:flex lg:flex-col lg:justify-end lg:p-12">
          <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" />
          <div className="max-w-md">
            <p className="text-2xs font-medium tracking-wide text-platform-muted uppercase">Gestão empresarial integrada</p>
            <p className="mt-3 text-2xl leading-tight font-semibold tracking-tight">Operação, finanças, fiscal e governança em um só lugar.</p>
            <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-platform-muted">
              <li className="border-t border-platform-border pt-3">Comercial e CRM</li>
              <li className="border-t border-platform-border pt-3">Suprimentos</li>
              <li className="border-t border-platform-border pt-3">Estoque e Logística</li>
              <li className="border-t border-platform-border pt-3">Produção</li>
              <li className="border-t border-platform-border pt-3">Financeiro e Fiscal</li>
              <li className="border-t border-platform-border pt-3">Controladoria</li>
            </ul>
          </div>
        </aside>
      }
    >
      <h1 className="text-xl font-semibold tracking-tight">Acesse sua conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use o e-mail e a senha do seu acesso ao EDUCA.</p>
      <div className="mt-6">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-6 text-xs text-subtle-foreground">O acesso é concedido pelo administrador da sua organização, por convite.</p>
    </AuthFrame>
  );
}
