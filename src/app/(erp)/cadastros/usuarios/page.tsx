import { redirect } from "next/navigation";

// Usuários agora vivem na Administração da Empresa (uma única tela).
export default function UsuariosCadastroRedirect() {
  redirect("/admin/users/cadastro");
}
