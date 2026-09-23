import { redirect } from "next/navigation";

// Papéis e permissões agora vivem na Administração da Empresa.
export default function PermissoesRedirect() {
  redirect("/admin/roles");
}
