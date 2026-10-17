// PATCH genérico dos cadastros: só os campos enviados são gravados
// (src/lib/validations/partial-update.ts). Regressão: com zod 4 o .partial()
// preenchia os ausentes com os defaults e apagava unidade, categoria, preços...
import { test } from "node:test";
import assert from "node:assert/strict";
import { schemasByEntity } from "@/lib/validations/cadastros";
import { onlyProvided } from "@/lib/validations/partial-update";

test("zod 4: .partial() devolve os defaults dos campos ausentes (por isso o filtro existe)", () => {
  const r = schemasByEntity.products.partial().safeParse({ descricao: "Pão" });
  assert.ok(r.success);
  assert.equal((r.data as Record<string, unknown>).unidadeId, "");
});

test("PATCH de produto só com a descrição não toca unidade, categoria, preço nem situação", () => {
  const body = { descricao: "Pão" };
  const r = schemasByEntity.products.partial().safeParse(body);
  assert.ok(r.success);
  assert.deepEqual(onlyProvided(r.data as Record<string, unknown>, body), { descricao: "Pão" });
});

test("campo enviado vazio continua sendo gravado (limpar de propósito)", () => {
  const body = { marcaId: "", precoVenda: 0 };
  const r = schemasByEntity.products.partial().safeParse(body);
  assert.ok(r.success);
  assert.deepEqual(onlyProvided(r.data as Record<string, unknown>, body), { marcaId: "", precoVenda: 0 });
});

test("valores normalizados pelo esquema (trim) são os gravados", () => {
  const body = { nome: "  Caixa  " };
  const r = schemasByEntity.units.partial().safeParse(body);
  assert.ok(r.success);
  assert.deepEqual(onlyProvided(r.data as Record<string, unknown>, body), { nome: "Caixa" });
});
