"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { clienteCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={clienteCadastroConfig} />;
}
