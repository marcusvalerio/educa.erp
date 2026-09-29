// CPF e CNPJ: formato e dígitos verificadores (E2E NOVA ORBITA, P5–P7).
// Lógica pura, usada pela API e pelos formulários — a mesma regra dos dois
// lados. Existem cadastros antigos (fictícios) com dígitos inválidos: quem
// valida uma ALTERAÇÃO só deve aplicar a regra quando o documento mudou
// (ver documentChanged), para não travar a edição de outros campos.

export const onlyDigits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

function checkDigit(digits: number[], weights: number[]) {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

const allSame = (d: string) => /^(\d)\1*$/.test(d);

export function isValidCnpj(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || allSame(d)) return false;
  const n = [...d].map(Number);
  return (
    checkDigit(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[12] &&
    checkDigit(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[13]
  );
}

export function isValidCpf(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || allSame(d)) return false;
  const n = [...d].map(Number);
  return checkDigit(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) === n[9] && checkDigit(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === n[10];
}

/** Mensagem de erro do CNPJ, ou null quando válido. */
export function cnpjError(value: string | null | undefined): string | null {
  const d = onlyDigits(value);
  if (d.length !== 14) return "CNPJ deve conter 14 dígitos.";
  return isValidCnpj(d) ? null : "CNPJ inválido: confira os dígitos verificadores.";
}

/** Mensagem de erro do CPF, ou null quando válido. */
export function cpfError(value: string | null | undefined): string | null {
  const d = onlyDigits(value);
  if (d.length !== 11) return "CPF deve conter 11 dígitos.";
  return isValidCpf(d) ? null : "CPF inválido: confira os dígitos verificadores.";
}

/** Documento de pessoa (cliente/fornecedor): CPF para física, CNPJ para jurídica. */
export function personDocumentError(tipo: string | null | undefined, value: string | null | undefined): string | null {
  return tipo === "Pessoa Física" ? cpfError(value) : cnpjError(value);
}

/** Documento livre (empresa): 14 dígitos = CNPJ, 11 = CPF; outro tamanho é erro. */
export function taxIdError(value: string | null | undefined): string | null {
  const d = onlyDigits(value);
  if (d.length === 14) return cnpjError(d);
  if (d.length === 11) return cpfError(d);
  return "Informe um CNPJ (14 dígitos) ou CPF (11 dígitos).";
}

export function documentChanged(previous: string | null | undefined, next: string | null | undefined): boolean {
  return onlyDigits(previous) !== onlyDigits(next);
}
