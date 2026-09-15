// Parser/serializador CSV (RFC 4180-ish) — sem dependências externas
// (Fase 21, seção 21.1: "reutilizar dependências existentes quando
// possível. Não adicionar bibliotecas desnecessárias"). Suporta campos
// entre aspas com vírgula/quebra de linha/aspas escapadas (""), CRLF e
// LF, e ignora uma linha totalmente vazia ao final do arquivo.
//
// XLSX NÃO é suportado nesta fase por decisão de segurança deliberada:
// a única biblioteca Node amplamente usada para isso (`xlsx`/SheetJS,
// publicada no npm) tem uma vulnerabilidade de Prototype Pollution e
// uma de ReDoS conhecidas e SEM correção disponível na versão do
// registro npm (a versão corrigida só é distribuída pelo CDN próprio da
// SheetJS, fora do fluxo normal de `npm install`) — ver
// docs/IMPORT_EXPORT.md. `format` já aceita 'XLSX' na modelagem (banco
// e tipos) para não exigir migração quando uma biblioteca segura
// existir; o parser/writer real fica para quando isso acontecer.

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

export function parseCsv(text: string): ParsedCsv {
  if (text.trim() === "") return { headers: [], rows: [] };

  const rows = parseCsvRows(text);
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).filter((r) => !(r.length === 1 && r[0] === ""));

  return {
    headers,
    rows: dataRows.map((r) => {
      const record: Record<string, string> = {};
      headers.forEach((header, i) => {
        record[header] = (r[i] ?? "").trim();
      });
      return record;
    }),
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < normalized.length) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  row.push(field);
  if (!(row.length === 1 && row[0] === "" && rows.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
