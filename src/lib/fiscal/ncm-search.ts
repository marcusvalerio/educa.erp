// Consulta da Nomenclatura Comum do Mercosul (NCM) na tabela pública vigente
// (BrasilAPI, que espelha a tabela da Receita/Siscomex). Só códigos de 8
// dígitos servem para produto; capítulos e posições (2 e 4 dígitos) entram
// apenas como contexto da descrição.

export type NcmItem = { code: string; digits: string; description: string };

export const NCM_API = "https://brasilapi.com.br/api/ncm/v1";

/** Só dígitos; "8536.20.00" → "85362000". */
export function ncmDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** "85362000" → "8536.20.00" (parcial para menos dígitos). */
export function formatNcm(value: string): string {
  const d = ncmDigits(value).slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}

/** Termo de busca aceito: 2+ dígitos ou 3+ letras. */
export function normalizeNcmQuery(q: string): string | null {
  const t = q.trim().replace(/\s+/g, " ");
  if (/^[\d.\s]+$/.test(t)) {
    const d = ncmDigits(t);
    return d.length >= 2 ? d : null;
  }
  return t.length >= 3 ? t.slice(0, 60) : null;
}

type Raw = { codigo?: unknown; descricao?: unknown; data_fim?: unknown };

/** Limpa a descrição oficial ("- - Disjuntores" → "Disjuntores"). */
function clean(desc: string): string {
  return desc.replace(/^[\s\-–]+/, "").replace(/\s+/g, " ").trim();
}

/**
 * Converte a resposta da tabela em itens de 8 dígitos vigentes. A descrição
 * de um item curto ("Outros", "Disjuntores") ganha a posição de 4 dígitos
 * à frente, quando ela veio na mesma resposta, para fazer sentido sozinha.
 */
export function parseNcmResponse(raw: unknown, today = new Date().toISOString().slice(0, 10), limit = 25): NcmItem[] {
  if (!Array.isArray(raw)) return [];
  const rows = (raw as Raw[]).filter((r) => typeof r?.codigo === "string" && typeof r?.descricao === "string" && (typeof r.data_fim !== "string" || r.data_fim >= today));
  const headings = new Map<string, string>();
  for (const r of rows) {
    const d = ncmDigits(String(r.codigo));
    if (d.length === 4) headings.set(d, clean(String(r.descricao)));
  }
  const seen = new Set<string>();
  const out: NcmItem[] = [];
  for (const r of rows) {
    const digits = ncmDigits(String(r.codigo));
    if (digits.length !== 8 || seen.has(digits)) continue;
    seen.add(digits);
    let description = clean(String(r.descricao));
    const head = headings.get(digits.slice(0, 4));
    if (head && description.length < 40 && !description.toLowerCase().startsWith(head.toLowerCase().slice(0, 12))) {
      description = `${head.length > 70 ? `${head.slice(0, 70).trimEnd()}…` : head} › ${description}`;
    }
    out.push({ code: formatNcm(digits), digits, description });
    if (out.length >= limit) break;
  }
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Busca na cópia local da tabela NCM (src/lib/fiscal/ncm-table.json, exportada
 * da BrasilAPI). Não depende de serviço externo: é a fonte principal da
 * consulta. Números: prefixo do código. Texto: todas as palavras na descrição
 * do item ou da posição de 4 dígitos.
 */
export function searchNcmTable(table: [string, string][], q: string, limit = 25): NcmItem[] {
  const digits = /^\d+$/.test(q);
  const words = fold(q).split(" ").filter(Boolean);
  const heads = new Map<string, string>();
  for (const [code, desc] of table) if (ncmDigits(code).length === 4) heads.set(ncmDigits(code), fold(desc));
  // primeiro quem tem o termo na própria descrição; depois pela posição de 4 dígitos
  const hits: [string, string][] = [];
  for (const pass of [0, 1]) {
    for (const row of table) {
      if (hits.length >= limit) break;
      const d = ncmDigits(row[0]);
      if (d.length !== 8 || hits.includes(row)) continue;
      const own = fold(row[1]);
      const head = heads.get(d.slice(0, 4)) ?? "";
      const ok = digits
        ? pass === 0 && d.startsWith(q)
        : pass === 0
          ? words.every((w) => own.includes(w))
          : words.every((w) => own.includes(w) || head.includes(w));
      if (ok) hits.push(row);
    }
  }
  const context = table.filter(([c]) => ncmDigits(c).length === 4 && hits.some(([h]) => ncmDigits(h).startsWith(ncmDigits(c))));
  return parseNcmResponse([...context, ...hits].map(([codigo, descricao]) => ({ codigo, descricao })), undefined, limit);
}
