"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { produtoCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={produtoCadastroConfig} />;
}
