"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { fornecedorCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={fornecedorCadastroConfig} />;
}
