// Máscaras aplicadas enquanto se digita (CPF/CNPJ e CEP) e consulta de CEP
// na ViaCEP (pública, chamada do navegador). Falha de rede não bloqueia o
// cadastro: a consulta só devolve null.

const digits = (v: string) => v.replace(/\D/g, "");

/** CPF (até 11 dígitos) ou CNPJ (12–14), formatado progressivamente. Tax ID com letras fica como está. */
export function maskCpfCnpj(value: string): string {
  if (/[a-z]/i.test(value)) return value;
  const d = digits(value).slice(0, 14);
  if (d.length <= 11) {
    const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".");
    return d.length > 9 ? `${p}-${d.slice(9)}` : p;
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}${d.length > 12 ? `-${d.slice(12)}` : ""}`;
}

export function maskCep(value: string): string {
  const d = digits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export type CepAddress = { estado: string; cidade: string; endereco: string; bairro: string };

export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepAddress | null> {
  const d = digits(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { erro?: unknown; uf?: string; localidade?: string; logradouro?: string; bairro?: string };
    if (j.erro) return null;
    return { estado: j.uf ?? "", cidade: j.localidade ?? "", endereco: j.logradouro ?? "", bairro: j.bairro ?? "" };
  } catch {
    return null;
  }
}
