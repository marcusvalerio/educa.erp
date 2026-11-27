// Endereço do cliente: usado para avisar (sem bloquear) que a NF-e será
// recusada enquanto o cadastro estiver incompleto e para exibir o endereço
// do cadastro quando o pedido não tiver endereço de entrega próprio.

export type CustomerAddressFields = {
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
};

/** Campos obrigatórios para a NF-e que estão vazios no cadastro do cliente. */
export function missingCustomerAddressFields(c: CustomerAddressFields | null | undefined): string[] {
  if (!c) return [];
  const missing: string[] = [];
  if (!c.endereco?.trim()) missing.push("logradouro");
  if (!c.cidade?.trim()) missing.push("cidade");
  if (!c.estado?.trim()) missing.push("UF");
  if (!c.cep?.replace(/\D/g, "")) missing.push("CEP");
  return missing;
}

export function customerAddressWarning(missing: string[]): string {
  return `O cadastro do cliente está sem ${missing.join(", ")}. O pedido pode seguir, mas a nota fiscal será recusada até completar o endereço em Cadastros › Clientes.`;
}

export function formatCustomerAddress(c: CustomerAddressFields | null | undefined): string {
  if (!c) return "";
  return [c.endereco, c.numero, c.complemento, c.bairro, c.cidade, c.estado].map((v) => v?.trim()).filter(Boolean).join(", ");
}
