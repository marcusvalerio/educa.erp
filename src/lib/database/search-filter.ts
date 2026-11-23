/**
 * Filtro .or() da busca livre. O termo vai entre aspas (sintaxe do PostgREST)
 * para que vírgula e parênteses não quebrem o filtro; aspas, barra invertida
 * e curingas (% _ *) são removidos do texto digitado.
 */
export function searchFilter(columns: readonly string[], search: string): string {
  const term = search.trim().replace(/["\\%_*]/g, "");
  return columns.map((col) => `${col}.ilike."%${term}%"`).join(",");
}
