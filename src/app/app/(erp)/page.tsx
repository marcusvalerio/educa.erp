import { Suspense } from "react";
import type { Metadata } from "next";
import { OperationalCenter } from "@/components/dashboard/AreaDashboard";

export const metadata: Metadata = { title: "Início" };

// Página inicial: centro operacional do usuário, com os dados reais que
// o perfil dele pode ler (nenhum número é fabricado).
export default function HomePage() {
  return (
    <Suspense>
      <OperationalCenter />
    </Suspense>
  );
}
