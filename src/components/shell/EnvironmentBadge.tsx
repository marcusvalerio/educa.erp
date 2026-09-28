import { isHomologation } from "@/lib/environment";

// Selo fixo que identifica o ambiente de homologação em todas as telas
// (login, ERP, administração). Só aparece com APP_ENV=homologacao; em
// produção não renderiza nada. Não captura cliques.
export function EnvironmentBadge() {
  if (!isHomologation()) return null;
  return (
    <div
      role="status"
      aria-label="Ambiente de homologação — dados fictícios"
      className="pointer-events-none fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-warning bg-warning px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-warning-contrast shadow-sm"
    >
      Homologação · dados fictícios
    </div>
  );
}
