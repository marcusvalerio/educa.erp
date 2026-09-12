import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken">
        <Compass size={26} strokeWidth={1.5} className="text-ink-subtle" />
      </span>
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">Página não encontrada</h1>
        <p className="mt-1.5 max-w-sm text-[13.5px] text-ink-muted">
          O endereço acessado não existe ou foi movido. Volte ao painel para continuar navegando.
        </p>
      </div>
      <Link href="/">
        <Button>Voltar ao Dashboard</Button>
      </Link>
    </div>
  );
}
