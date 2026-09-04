"use client";

import { CadastroPage } from "@/components/cadastro/CadastroPage";
import { usuarioCadastroConfig } from "@/lib/cadastros/configs";

export default function Page() {
  return <CadastroPage config={usuarioCadastroConfig} />;
}
