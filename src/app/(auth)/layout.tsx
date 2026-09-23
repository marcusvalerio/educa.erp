import type { Metadata } from "next";

export const metadata: Metadata = { title: "Entrar" };

// Layout próprio de autenticação: sem sidebar, topbar ou navegação
// operacional. Só a página de acesso.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
