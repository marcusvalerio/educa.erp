"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { motoristaCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={motoristaCadastroConfig} />;
}
