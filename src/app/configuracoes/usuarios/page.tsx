"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { usuarioCadastroConfig } from "@/lib/cadastros/configs";

// Mesmo cadastro real de /cadastros/usuarios — "Configurações →
// Usuários" é só outro ponto de entrada para o mesmo CRUD (nenhum
// cadastro de usuário duplicado).
export default function Page() {
  return <CadastroPage config={usuarioCadastroConfig} />;
}
