// Tradução dos erros do PostgreSQL para a API (src/lib/database/errors.ts).
// Regras de negócio do banco chegam ao usuário com a mensagem da regra
// (E2E NOVA ORBITA: P1, P8 e P13); erro técnico continua genérico (500).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { translatePostgresError } from "../src/lib/database/errors";

describe("translatePostgresError", () => {
  test("regra de negócio (P0001) -> 422 com a mensagem da regra", () => {
    const e = translatePostgresError({ code: "P0001", message: "NCM não informado e produto NO-001 não possui perfil fiscal ativo com NCM configurado." });
    assert.equal(e.status, 422);
    assert.equal(e.code, "BUSINESS_RULE");
    assert.match(e.message, /NCM não informado/);
  });

  test("valor inválido levantado por função (22023) -> 422", () => {
    const e = translatePostgresError({ code: "22023", message: "Quantidade do movimento deve ser maior que zero." });
    assert.equal(e.status, 422);
    assert.equal(e.message, "Quantidade do movimento deve ser maior que zero.");
  });

  test("não encontrado (P0002) -> 404 e permissão negada (42501) -> 403", () => {
    assert.equal(translatePostgresError({ code: "P0002", message: "Pedido de venda não encontrado." }).status, 404);
    assert.equal(translatePostgresError({ code: "42501", message: "Permissão negada (stock.create)." }).status, 403);
  });

  test("FK na gravação -> 422 dizendo o que não existe (não é exclusão)", () => {
    const e = translatePostgresError({
      code: "23503",
      message: 'insert or update on table "stock_movements" violates foreign key constraint "stock_movements_location_id_company_id_fkey"',
    });
    assert.equal(e.status, 422);
    assert.equal(e.message, "O local de estoque informado não existe nesta empresa.");
    assert.doesNotMatch(e.message, /excluir/);
  });

  test("FK na exclusão -> 409 com orientação de inativar", () => {
    const e = translatePostgresError({
      code: "23503",
      message: 'update or delete on table "customers" violates foreign key constraint "sales_orders_customer_id_fkey" on table "sales_orders"',
    });
    assert.equal(e.status, 409);
    assert.match(e.message, /Não é possível excluir/);
  });

  test("campo obrigatório nulo (23502) -> 422", () => {
    assert.equal(translatePostgresError({ code: "23502", message: 'null value in column "x" violates not-null constraint' }).status, 422);
  });

  test("erro técnico continua 500 genérico, sem repassar a mensagem do banco", () => {
    const e = translatePostgresError({ code: "42702", message: 'column reference "taxes_amount" is ambiguous' });
    assert.equal(e.status, 500);
    assert.doesNotMatch(e.message, /taxes_amount/);
  });
});

describe("translatePostgresError — mensagens técnicas do PostgreSQL não vazam", () => {
  test("22023 do próprio PostgreSQL (minúscula, inglês) continua 500 genérico", () => {
    const e = translatePostgresError({ code: "22023", message: "cannot get array length of a scalar" });
    assert.equal(e.status, 500);
    assert.doesNotMatch(e.message, /array/);
  });
  test("42501 do PostgreSQL (permission denied for table) não vira mensagem ao usuário", () => {
    const e = translatePostgresError({ code: "42501", message: "permission denied for table stock_balances" });
    assert.equal(e.status, 500);
  });
});
