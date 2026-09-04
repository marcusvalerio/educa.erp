import clsx from "clsx";

const POSITIVE = new Set([
  "ativo",
  "aprovado",
  "concluído",
  "concluido",
  "faturado",
  "disponível",
  "disponivel",
  "recebido",
  "confirmado",
  "conferido",
  "autorizada",
  "pago",
  "preenchido",
]);

const NEGATIVE = new Set([
  "inativo",
  "cancelado",
  "cancelada",
  "bloqueado",
  "rejeitada",
  "atrasado",
  "vencido",
  "falhou",
  "divergência",
  "divergencia",
]);

const WARNING = new Set([
  "pendente",
  "em análise",
  "em analise",
  "em aberto",
  "aguardando confirmação",
  "aguardando confirmacao",
  "reagendado",
  "processando",
  "revisão pendente",
  "revisao pendente",
  "em cotação",
  "em cotacao",
  "enviado",
  "reservado",
  "baixo estoque",
  "em contagem",
  "atenção",
  "atencao",
]);

const INFO = new Set(["em andamento", "em separação", "em separacao", "ocupado"]);

function tone(status: string): "success" | "danger" | "warning" | "info" | "neutral" {
  const s = status.toLowerCase();
  if (POSITIVE.has(s)) return "success";
  if (NEGATIVE.has(s)) return "danger";
  if (WARNING.has(s)) return "warning";
  if (INFO.has(s)) return "info";
  return "neutral";
}

const TONE_CLASSES: Record<string, string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const t = tone(status);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[t]
      )}
    >
      <span
        className={clsx("h-1.5 w-1.5 rounded-full", {
          "bg-success": t === "success",
          "bg-danger": t === "danger",
          "bg-warning": t === "warning",
          "bg-info": t === "info",
          "bg-neutral": t === "neutral",
        })}
      />
      {status}
    </span>
  );
}
