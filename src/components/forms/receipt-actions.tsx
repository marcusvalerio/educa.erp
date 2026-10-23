import { Ban, CheckCircle2, FileText, Receipt } from "lucide-react";
import type { WorkflowAction } from "./WorkflowActions";

// Ações do recebimento de compra (Recebimento e Agendamentos).
export const RECEIPT_ACTIONS: WorkflowAction[] = [
  { id: "confirm", label: "Confirmar entrada no estoque", path: "confirm", permission: "purchase_receipts.confirm", statuses: ["draft"], confirm: "As quantidades aceitas entram no estoque, no local indicado; a conta a pagar ao fornecedor é gerada (parcelas pela condição do pedido de compra) e a NF de entrada é lançada no Fiscal.", success: "Entrada confirmada: estoque, conta a pagar e NF de entrada.", icon: <CheckCircle2 size={14} aria-hidden /> },
  { id: "payable", label: "Gerar conta a pagar", path: "generate-payable", permission: "accounts_payable.approve", statuses: ["confirmed"], confirm: "Gera a conta a pagar deste recebimento (se ela ainda não existir). Recebimentos confirmados agora já geram sozinhos.", success: "Conta a pagar pronta em Financeiro › Contas a pagar.", icon: <Receipt size={14} aria-hidden /> },
  { id: "entry-invoice", label: "Lançar NF de entrada", path: "entry-invoice", permission: "fiscal_documents.create", statuses: ["confirmed"], confirm: "Registra no Fiscal a nota do fornecedor deste recebimento (itens e valores recebidos). Se já existir, nada é duplicado.", success: "NF de entrada em Fiscal › Notas fiscais.", icon: <FileText size={14} aria-hidden /> },
  { id: "reject", label: "Recusar recebimento", path: "reject", permission: "purchase_receipts.reject", statuses: ["draft"], confirm: "Nada entra no estoque e o pedido continua aguardando.", success: "Recebimento recusado.", tone: "danger", icon: <Ban size={14} aria-hidden /> },
];
