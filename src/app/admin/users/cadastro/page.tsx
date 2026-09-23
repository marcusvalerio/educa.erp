"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { usuarioCadastroConfig } from "@/lib/cadastros/configs";

// Cadastro básico dos usuários (nome, e-mail, login, status) via
// /api/users. Papéis, unidades, setor e cargo ficam em /admin/users.
const config = { ...usuarioCadastroConfig, moduleLabel: "Usuários", moduleHref: "/admin/users" };

export default function AdminUsersCadastroPage() {
  return <CadastroPage config={config} />;
}
