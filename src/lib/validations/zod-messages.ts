import { z } from "zod";

// Mensagens padrão do Zod em português para os casos sem mensagem própria
// no schema. Sem isto, o usuário via "Invalid input: expected string,
// received undefined" ao deixar um campo obrigatório vazio. Mensagens
// escritas no schema (.min(1, "Informe…")) continuam valendo — o Zod só
// recorre a este mapa quando o schema não definiu a sua.
const FIELD_LABELS: Record<string, string> = {
  nome: "o nome", nomeFantasia: "o nome fantasia", razaoSocial: "a razão social", documento: "o CPF/CNPJ", tipo: "o tipo",
  codigo: "o código", descricao: "a descrição", categoria: "a categoria", subcategoria: "a subcategoria", unidade: "a unidade",
  precoVenda: "o preço de venda", precoCusto: "o preço de custo", precoMinimo: "o preço mínimo",
  estoqueMinimo: "o estoque mínimo", estoqueMaximo: "o estoque máximo", pontoReposicao: "o ponto de reposição",
  customerId: "o cliente", supplierId: "o fornecedor", productId: "o produto", locationId: "o local de estoque",
  warehouseId: "o depósito", items: "os itens", quantity: "a quantidade", unitPrice: "o preço unitário", discount: "o desconto",
  amount: "o valor", originalAmount: "o valor", dueDate: "o vencimento", description: "a descrição", email: "o e-mail",
  financialAccountId: "a conta financeira", categoryId: "a categoria", reason: "o motivo",
};

export function fieldLabel(path: ReadonlyArray<PropertyKey> | undefined): string | null {
  const key = [...(path ?? [])].reverse().find((k): k is string => typeof k === "string");
  return key ? (FIELD_LABELS[key] ?? null) : null;
}

export function portugueseIssueMessage(issue: { code?: string; input?: unknown; path?: ReadonlyArray<PropertyKey>; expected?: string }): string | undefined {
  const label = fieldLabel(issue.path);
  if (issue.code === "invalid_type") {
    if (issue.input === undefined || issue.input === null || issue.input === "") {
      return label ? `Informe ${label}.` : "Preencha os campos obrigatórios.";
    }
    if (issue.expected === "number") return label ? `Informe ${label} como número (ex.: 10,50 → 10.50).` : "Use apenas números nos campos de valor e quantidade.";
    return label ? `Confira ${label}: o formato não é válido.` : "Um dos campos está em formato inválido. Revise os dados.";
  }
  if (issue.code === "invalid_value" || issue.code === "invalid_union") return label ? `Escolha uma opção válida para ${label}.` : "Escolha uma das opções disponíveis.";
  if (issue.code === "invalid_format") return label ? `Confira ${label}: o formato não é válido.` : "Um dos campos está em formato inválido.";
  if (issue.code === "too_big") return label ? `Valor muito grande para ${label}.` : "Um dos valores passa do limite permitido.";
  if (issue.code === "too_small") return label ? `Valor muito pequeno para ${label}.` : "Um dos valores está abaixo do mínimo permitido.";
  if (issue.code === "unrecognized_keys") return undefined;
  return undefined;
}

let installed = false;
export function installPortugueseZodMessages() {
  if (installed) return;
  installed = true;
  z.config({ customError: (issue) => portugueseIssueMessage(issue as never) });
}

installPortugueseZodMessages();
