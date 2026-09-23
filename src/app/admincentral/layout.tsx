import type { Metadata } from "next";
import { ShellFrame } from "@/components/shell/ShellFrame";

export const metadata: Metadata = { title: { default: "Administração Central", template: "%s · Administração Central · EDUCA" } };

// Administração Central da plataforma (Platform Owner / Admin). Não dá
// acesso a dados operacionais de nenhuma empresa.
export default function AdminCentralLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame environment="platform">{children}</ShellFrame>;
}
