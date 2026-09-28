import { redirect } from "next/navigation";

// Usuários agora vivem na Administração da Empresa (uma única tela).
export default function UsuariosConfigRedirect() {
  redirect("/app/admin/users");
}
