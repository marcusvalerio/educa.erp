import { ShellFrame } from "@/components/shell/ShellFrame";

// Ambiente operacional do ERP (empresa do usuário).
export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return <ShellFrame environment="erp">{children}</ShellFrame>;
}
