"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { veiculoCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={veiculoCadastroConfig} />;
}
