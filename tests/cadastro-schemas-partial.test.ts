// O PATCH genérico (src/lib/api/handlers.ts) usa schemasByEntity[x].partial():
// nenhum esquema de cadastro pode ter refinamento no objeto (o zod recusa
// .partial() nesse caso). Regressão encontrada no reteste do E2E (0076).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { schemasByEntity, createSchemasByEntity } from "@/lib/validations/cadastros";

describe("esquemas dos cadastros genéricos", () => {
  for (const [entity, schema] of Object.entries(schemasByEntity)) {
    test(`${entity}: aceita .partial() (alteração parcial)`, () => {
      assert.doesNotThrow(() => (schema as { partial: () => unknown }).partial());
    });
  }
  test("local de estoque: a regra do depósito vale na criação", () => {
    assert.equal(createSchemasByEntity["warehouse-locations"]!.safeParse({ codigoLocal: "NO-A01", tipo: "Armazenagem" }).success, false);
    assert.equal(schemasByEntity["warehouse-locations"].partial().safeParse({ descricao: "Editado" }).success, true);
  });
});
