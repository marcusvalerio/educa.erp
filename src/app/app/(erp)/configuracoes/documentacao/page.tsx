"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { ManualsPanel } from "@/components/settings/ManualsPanel";
import { useSession } from "@/components/shell/SessionProvider";
import { COMPANY_GOVERNANCE_PERMISSIONS, manualsFor } from "@/lib/manuals";

export default function DocumentacaoPage() {
  const { data, canAny } = useSession();
  const governsCompany = canAny([...COMPANY_GOVERNANCE_PERMISSIONS]);
  const manuals = manualsFor({ governsCompany, platformMember: !!data?.platform });
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Documentação" description="Manuais do ATLAS.ERP para consulta e download." />
      <ManualsPanel
        manuals={manuals}
        description={governsCompany ? "Como administrador da empresa, você tem acesso aos dois manuais." : "O Manual de Administração fica disponível para o administrador da empresa."}
      />
    </div>
  );
}
