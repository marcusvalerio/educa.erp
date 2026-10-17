// Alteração parcial (PATCH): só os campos ENVIADOS chegam ao banco.
// Com zod 4, schema.partial() ainda aplica os .default() dos campos ausentes
// (ex.: unidadeId "" , precoVenda 0, status "Ativo"); sem este filtro, um
// PATCH com um único campo apagava unidade, categoria, marca, fornecedor,
// preços e reativava o cadastro.
export function onlyProvided<T extends Record<string, unknown>>(data: T, body: object): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => Object.prototype.hasOwnProperty.call(body, key))) as Partial<T>;
}

/** schema.partial() que devolve só os campos enviados (para parseBody). */
export function providedPartial<S extends { partial: () => { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: unknown } } }>(schema: S) {
  const partial = schema.partial();
  return {
    safeParse(value: unknown) {
      const r = partial.safeParse(value);
      if (!r.success || !value || typeof value !== "object") return r;
      return { ...r, data: onlyProvided(r.data as Record<string, unknown>, value as object) };
    },
  } as ReturnType<S["partial"]>;
}
