import { onlyDigits } from "./uf";

// Chave de acesso da NF-e (44 dígitos):
// cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1).

/** Dígito verificador módulo 11 (pesos 2 a 9 da direita para a esquerda). */
export function mod11(digits: string): string {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? "0" : String(11 - rest);
}

/** CNPJ com dígitos verificadores corretos. */
export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? "0" : String(11 - rest);
  };
  const first = calc(d.slice(0, 12));
  return first === d[12] && calc(d.slice(0, 13)) === d[13];
}

/** CPF com dígitos verificadores corretos. */
export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Código numérico (cNF) estável a partir de um texto (ex.: id do documento); nunca igual ao número da nota. */
export function numericCode(seed: string, nNF: number): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let code = String(h % 100000000).padStart(8, "0");
  if (Number(code) === nNF) code = String((Number(code) + 1) % 100000000).padStart(8, "0");
  return code;
}

export type AccessKeyParts = {
  cUF: string;
  /** Data de emissão: usa ano/mês. */
  issuedAt: Date;
  cnpj: string;
  model?: string;
  series: number;
  number: number;
  emissionType?: number;
  numericCode: string;
};

export function buildAccessKey(p: AccessKeyParts): string {
  const yy = String(p.issuedAt.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(p.issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const base =
    p.cUF.padStart(2, "0") +
    yy +
    mm +
    onlyDigits(p.cnpj).padStart(14, "0") +
    (p.model ?? "55") +
    String(p.series).padStart(3, "0") +
    String(p.number).padStart(9, "0") +
    String(p.emissionType ?? 1) +
    p.numericCode.padStart(8, "0");
  if (base.length !== 43) throw new Error("Dados insuficientes para montar a chave de acesso.");
  return base + mod11(base);
}

export function isValidAccessKey(key: string): boolean {
  return /^\d{44}$/.test(key) && mod11(key.slice(0, 43)) === key[43];
}

/** Chave em blocos de 4 dígitos, como impressa na DANFE. */
export const formatAccessKey = (key: string) => key.replace(/(\d{4})(?=\d)/g, "$1 ");
