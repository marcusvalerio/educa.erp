"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { transportadoraCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={transportadoraCadastroConfig} />;
}
