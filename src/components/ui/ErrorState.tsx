import { XCircle, RefreshCcw } from "lucide-react";
import { Button } from "./Button";

type ErrorStateProps = {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = "Não foi possível carregar os dados",
  description,
  onRetry,
  retryLabel = "Tentar novamente",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-danger/40 bg-danger-soft/40 py-16 text-center animate-fade-in">
      <XCircle size={28} className="text-danger" />
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-ink-subtle">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCcw size={15} />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
