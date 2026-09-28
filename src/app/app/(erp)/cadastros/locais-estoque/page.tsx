"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { localEstoqueCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={localEstoqueCadastroConfig} />;
}
