// Testes de validação (Zod) do domínio Comercial
// (src/lib/validations/commercial.ts e as extensões em
// src/lib/validations/cadastros.ts). Cobrem a camada de forma/tipo.
//
// IMPORTANTE — o que NÃO está coberto aqui: reserva parcial,
// impedimento de overbooking, liberação de reserva ao cancelar,
// recálculo de status do pedido, idempotência de
// fn_reserve_sales_order_stock, RBAC via has_permission e isolamento
// por company_id vivem nas funções SQL (supabase/migrations/0019-0021)
// e só são verificáveis contra um Postgres real — fora do alcance
// desta etapa (nenhum Supabase real foi tocado). Ver docs/COMMERCIAL.md.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  salesRepresentativeSchema,
  priceListSchema,
  priceListItemSchema,
  customerSchema,
} from "@/lib/validations/cadastros";
import {
  createPaymentTermSchema,
  updatePaymentTermSchema,
  createSalesQuoteSchema,
  createSalesOrderSchema,
  reserveSalesOrderStockSchema,
} from "@/lib/validations/commercial";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("salesRepresentativeSchema", () => {
  test("exige nome do vendedor", () => {
    assert.equal(salesRepresentativeSchema.safeParse({}).success, false);
  });

  test("aceita vendedor válido com percentual de comissão", () => {
    const result = salesRepresentativeSchema.safeParse({ nome: "João Vendas", percentualComissao: 5 });
    assert.equal(result.success, true);
  });
});

describe("priceListSchema / priceListItemSchema", () => {
  test("exige código e nome da tabela de preço", () => {
    assert.equal(priceListSchema.safeParse({}).success, false);
    assert.equal(priceListSchema.safeParse({ codigo: "VAREJO", nome: "Varejo" }).success, true);
  });

  test("rejeita preço negativo no item da tabela", () => {
    const result = priceListItemSchema.safeParse({ tabelaPrecoId: uuid1, produtoId: uuid2, preco: -10 });
    assert.equal(result.success, false);
  });

  test("aceita item de tabela de preço válido", () => {
    const result = priceListItemSchema.safeParse({ tabelaPrecoId: uuid1, produtoId: uuid2, preco: 90 });
    assert.equal(result.success, true);
  });
});

describe("customerSchema — extensão comercial", () => {
  test("statusComercial default é Ativo", () => {
    const result = customerSchema.safeParse({ tipo: "Pessoa Jurídica", nome: "Cliente Teste", documento: "12.345.678/0001-90" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.statusComercial, "Ativo");
  });

  test("aceita Bloqueio de Crédito e rejeita valor fora do enum", () => {
    const valid = customerSchema.safeParse({
      tipo: "Pessoa Jurídica", nome: "Cliente Teste", documento: "12.345.678/0001-90", statusComercial: "Bloqueio de Crédito",
    });
    assert.equal(valid.success, true);

    const invalid = customerSchema.safeParse({
      tipo: "Pessoa Jurídica", nome: "Cliente Teste", documento: "12.345.678/0001-90", statusComercial: "Suspenso",
    });
    assert.equal(invalid.success, false);
  });
});

describe("createPaymentTermSchema / updatePaymentTermSchema", () => {
  test("exige ao menos uma parcela", () => {
    assert.equal(createPaymentTermSchema.safeParse({ name: "30/60/90", installments: [] }).success, false);
  });

  test("aceita condição com múltiplas parcelas (soma validada no banco, não aqui)", () => {
    const result = createPaymentTermSchema.safeParse({
      name: "30/60/90",
      installments: [
        { daysAfter: 30, percentage: 33.34 },
        { daysAfter: 60, percentage: 33.33 },
        { daysAfter: 90, percentage: 33.33 },
      ],
    });
    assert.equal(result.success, true);
  });

  test("rejeita parcela com percentual zero ou acima de 100", () => {
    assert.equal(createPaymentTermSchema.safeParse({ name: "X", installments: [{ percentage: 0 }] }).success, false);
    assert.equal(createPaymentTermSchema.safeParse({ name: "X", installments: [{ percentage: 101 }] }).success, false);
  });

  test("update aceita corpo parcial (só status)", () => {
    assert.equal(updatePaymentTermSchema.safeParse({ status: "Inativo" }).success, true);
  });
});

describe("createSalesQuoteSchema", () => {
  test("exige cliente e ao menos um item", () => {
    assert.equal(createSalesQuoteSchema.safeParse({ items: [] }).success, false);
  });

  test("aceita orçamento válido com desconto e frete", () => {
    const result = createSalesQuoteSchema.safeParse({
      customerId: uuid1,
      discount: 10,
      freightCost: 20,
      items: [{ description: "Mesa Modelo X", quantity: 2, unitPrice: 450 }],
    });
    assert.equal(result.success, true);
  });
});

describe("createSalesOrderSchema", () => {
  test("exige customerId", () => {
    assert.equal(createSalesOrderSchema.safeParse({}).success, false);
  });

  test("aceita pedido sem items quando vai referenciar um orçamento (conversão)", () => {
    const result = createSalesOrderSchema.safeParse({ customerId: uuid1, salesQuoteId: uuid2 });
    assert.equal(result.success, true);
  });

  test("aceita pedido com items explícitos e endereço de entrega informado", () => {
    const result = createSalesOrderSchema.safeParse({
      customerId: uuid1,
      deliveryAddress: "Rua das Flores",
      deliveryCity: "São Paulo",
      items: [{ description: "Mesa Modelo X", quantity: 1, unitPrice: 450 }],
    });
    assert.equal(result.success, true);
  });
});

describe("reserveSalesOrderStockSchema", () => {
  test("exige local de onde reservar", () => {
    assert.equal(reserveSalesOrderStockSchema.safeParse({}).success, false);
    assert.equal(reserveSalesOrderStockSchema.safeParse({ locationId: uuid1 }).success, true);
  });
});
