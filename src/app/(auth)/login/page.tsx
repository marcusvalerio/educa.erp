"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { EducaMark } from "@/components/shell/Brand";
import { ThemeToggle } from "@/components/shell/ShellControls";
import { safeNextPath } from "@/lib/navigation/access";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        setError("E-mail ou senha inválidos. Confira os dados e tente novamente.");
        return;
      }
      router.push(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao servidor de autenticação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
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
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        }
      >
        <Input
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 text-foreground">
            <EducaMark />
            <span className="text-sm font-semibold tracking-tight">
              EDUCA<span className="text-subtle-foreground">.ERP</span>
            </span>
          </span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-xl font-semibold tracking-tight">Acesse sua conta</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use o e-mail e a senha cadastrados pela sua empresa.</p>
            <div className="mt-6">
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>
            <p className="mt-6 text-xs text-subtle-foreground">
              Problemas para entrar? O acesso é gerenciado pelo administrador da sua empresa.
            </p>
          </div>
        </div>
        <p className="text-2xs text-subtle-foreground">© EDUCA.ERP</p>
      </div>
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
    </div>
  );
}
