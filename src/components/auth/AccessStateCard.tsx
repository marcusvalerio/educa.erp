import type { ReactNode } from "react";
import { Ban, Building2, Clock } from "lucide-react";
import type { AccessState } from "@/lib/session/types";
import { AuthHeading, type AuthTone } from "./AuthFrame";
import { LogoutButton } from "./LogoutButton";

// Estados de quem entrou mas não pode operar. Mensagens para a pessoa,
// não para o técnico: sem ids, sem SQL, sem RLS, sem nada de outras
// empresas. O que resolve é sempre o administrador da organização.

const COPY: Record<Exclude<AccessState, "active">, { tone: AuthTone; icon: ReactNode; title: string; description: string }> = {
  unlinked: {
    tone: "warning",
    icon: <Clock size={18} aria-hidden />,
    title: "Seu acesso ainda não foi configurado.",
    description: "Entre em contato com o administrador da sua organização.",
  },
  inactive: {
    tone: "danger",
    icon: <Ban size={18} aria-hidden />,
    title: "Conta desativada",
    description: "O seu acesso a esta organização está desativado. Se precisar dele de volta, fale com o administrador da sua organização.",
  },
  no_company: {
    tone: "warning",
    icon: <Building2 size={18} aria-hidden />,
    title: "Acesso não configurado.",
    description: "Sua conta não está ligada a uma empresa disponível. Entre em contato com o administrador da sua organização.",
  },
};

export function AccessStateCard({ state, email, extra }: { state: Exclude<AccessState, "active">; email?: string | null; extra?: ReactNode }) {
  const copy = COPY[state];
  return (
    <div className="flex flex-col gap-6" data-access-state={state}>
      <AuthHeading icon={copy.icon} tone={copy.tone} title={copy.title} description={copy.description} />
      {email && (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
          Conectado como <span className="font-medium text-foreground">{email}</span>
        </p>
      )}
      {extra}
      <div>
        <LogoutButton variant="secondary" label="Sair e entrar com outra conta" />
      </div>
    </div>
  );
}
