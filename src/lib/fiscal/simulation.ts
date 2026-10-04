// Fiscal SIMULADO da homologação (migration 0082). Nada aqui fala com a
// SEFAZ: o documento recebe chave no formato da NF-e e protocolo
// "SIMULACAO-…", que deixa claro que não houve autorização real.

export const SIMULATION_WATERMARK = "ATLAS.ERP — SIMULAÇÃO";
export const SIMULATION_BANNER = "ATLAS.ERP · DOCUMENTO FISCAL SIMULADO · SEM VALOR FISCAL · NÃO AUTORIZADO PELA SEFAZ";

/** Protocolo gravado pelo provedor SIMULACAO (autorização ou cancelamento). */
export const isSimulatedProtocol = (protocol: string | null | undefined) => /^SIMULACAO-/.test(protocol ?? "");

/** Dígito verificador módulo 11 da chave de acesso (pesos 2..9 da direita para a esquerda). */
export function accessKeyCheckDigit(base43: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidAccessKey(key: string | null | undefined): boolean {
  const k = (key ?? "").replace(/\s/g, "");
  return /^\d{44}$/.test(k) && accessKeyCheckDigit(k.slice(0, 43)) === Number(k[43]);
}

/** 44 dígitos em 11 grupos de 4, como no documento auxiliar. */
export function formatAccessKey(key: string | null | undefined): string {
  const k = (key ?? "").replace(/\D/g, "");
  return k.replace(/(\d{4})(?=\d)/g, "$1 ");
}
