// Alteração parcial (PATCH): só os campos ENVIADOS chegam ao banco.
// Com zod 4, schema.partial() ainda aplica os .default() dos campos ausentes
// (ex.: unidadeId "" , precoVenda 0, status "Ativo"); sem este filtro, um
// PATCH com um único campo apagava unidade, categoria, marca, fornecedor,
// preços e reativava o cadastro.
export function onlyProvided<T extends Record<string, unknown>>(data: T, body: object): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => Object.prototype.hasOwnProperty.call(body, key))) as Partial<T>;
}
