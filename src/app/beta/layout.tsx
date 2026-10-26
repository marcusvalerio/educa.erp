import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Inter } from "next/font/google";
import { getSessionIdentity } from "@/lib/auth/session";
import { isBetaAllowed } from "@/lib/beta/access";
import { BetaShell } from "@/components/beta/BetaShell";
import "./beta.css";

// Beta (/beta): moldura nova sobre o MESMO login, banco e permissões.
// Sem link em nenhuma tela: entra quem digita /beta e está em BETA_EMAILS
// (checado aqui, no servidor). Os dados vêm das APIs atuais com a sessão
// do usuário (RLS); os itens do menu levam às telas atuais.

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-beta", display: "swap" });

export const metadata: Metadata = { title: "Beta", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BetaLayout({ children }: { children: React.ReactNode }) {
  const identity = await getSessionIdentity();
  if (!identity) redirect("/login?next=/beta");
  if (!isBetaAllowed(identity.email)) redirect("/app");
  return (
    <div className={`beta-root ${inter.variable}`}>
      <BetaShell>{children}</BetaShell>
    </div>
  );
}
