import type { Metadata } from "next";
import { ShellFrame } from "@/components/shell/ShellFrame";

export const metadata: Metadata = { title: { default: "Administração da Empresa", template: "%s · Administração · EDUCA.ERP" } };

// Administração da Empresa (Company Admin) — somente a empresa do usuário.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame environment="admin">{children}</ShellFrame>;
}
