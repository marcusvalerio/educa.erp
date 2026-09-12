import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  productSchema,
  customerSchema,
  driverSchema,
  vehicleSchema,
  userSchema,
  warehouseLocationSchema,
  categorySchema,
  brandSchema,
  productSupplierSchema,
  productPriceSchema,
  productUnitSchema,
} from "@/lib/validations/cadastros";

describe("productSchema", () => {
  test("rejeita produto sem campos obrigatórios", () => {
    const result = productSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("campo obrigatório ausente (não apenas vazio) mostra mensagem amigável, não o erro técnico padrão do Zod", () => {
    const result = productSchema.safeParse({});
    assert.equal(result.success, false);
    if (!result.success) {
      const message = result.error.issues[0].message;
      assert.equal(message, "Informe o código do produto.");
      assert.doesNotMatch(message, /expected string|invalid_type|received undefined/i);
    }
  });

  test("aceita produto válido e aplica defaults", () => {
    const result = productSchema.safeParse({
      codigo: "PRD-0001",
      descricao: "Parafuso Sextavado M8",
      categoria: "Ferramentas",
      unidade: "UN",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.status, "Ativo");
      assert.equal(result.data.loteControlado, false);
      assert.equal(result.data.estoqueMinimo, 0);
    }
  });
});

describe("customerSchema", () => {
  test("rejeita e-mail inválido", () => {
    const result = customerSchema.safeParse({
      tipo: "Pessoa Jurídica",
      nome: "Cliente Teste",
      documento: "12.345.678/0001-90",
      email: "não-é-um-email",
    });
    assert.equal(result.success, false);
  });

  test("aceita cliente sem e-mail (opcional)", () => {
    const result = customerSchema.safeParse({
      tipo: "Pessoa Física",
      nome: "Cliente Teste",
      documento: "123.456.789-00",
    });
    assert.equal(result.success, true);
  });
});

describe("driverSchema", () => {
  test("exige nome, cpf, cnh e categoria", () => {
    const result = driverSchema.safeParse({ nome: "Motorista Teste" });
    assert.equal(result.success, false);
  });

  test("aceita motorista completo", () => {
    const result = driverSchema.safeParse({
      nome: "Motorista Teste",
      cpf: "123.456.789-00",
      cnh: "12345678900",
      categoriaCnh: "B",
    });
    assert.equal(result.success, true);
  });
});

describe("vehicleSchema", () => {
  test("exige placa e modelo", () => {
    const result = vehicleSchema.safeParse({ placa: "ABC1D23" });
    assert.equal(result.success, false);
  });
});

describe("userSchema", () => {
  test("exige e-mail válido e login", () => {
    const result = userSchema.safeParse({
      nome: "Usuário Teste",
      email: "usuario@educaerp.com.br",
      login: "usuario.teste",
      perfil: "Consulta",
    });
    assert.equal(result.success, true);
  });
});

describe("warehouseLocationSchema", () => {
  test("exige código, armazém e tipo", () => {
    const result = warehouseLocationSchema.safeParse({ codigoLocal: "CD01-R01-M01-N01-P01" });
    assert.equal(result.success, false);
  });

  test("aceita local completo", () => {
    const result = warehouseLocationSchema.safeParse({
      codigoLocal: "CD01-R01-M01-N01-P01",
      armazem: "CD01",
      tipo: "Armazenagem",
    });
    assert.equal(result.success, true);
  });
});

describe("productSchema — catálogo relacional (categoriaId/marcaId)", () => {
  test("aceita produto válido sem categoriaId/marcaId (campos opcionais)", () => {
    const result = productSchema.safeParse({
      codigo: "PRD-0002",
      descricao: "Produto sem categoria/marca relacional",
      categoria: "Ferramentas",
      unidade: "UN",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.categoriaId, "");
      assert.equal(result.data.marcaId, "");
    }
  });

  test("aceita produto com categoriaId/marcaId preenchidos", () => {
    const result = productSchema.safeParse({
      codigo: "PRD-0003",
      descricao: "Produto com categoria/marca relacional",
      categoria: "Ferramentas",
      unidade: "UN",
      categoriaId: "33333333-3333-3333-3333-333333333333",
      marcaId: "44444444-4444-4444-4444-444444444444",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.categoriaId, "33333333-3333-3333-3333-333333333333");
      assert.equal(result.data.marcaId, "44444444-4444-4444-4444-444444444444");
    }
  });
});

describe("categorySchema", () => {
  test("rejeita categoria sem código/nome", () => {
    const result = categorySchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("campo ausente mostra mensagem amigável", () => {
    const result = categorySchema.safeParse({});
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0].message, "Informe o código da categoria.");
    }
  });

  test("aceita categoria válida (com e sem categoriaPaiId)", () => {
    const semPai = categorySchema.safeParse({ codigo: "CAT-RAIZ", nome: "Matéria-prima" });
    assert.equal(semPai.success, true);
    if (semPai.success) assert.equal(semPai.data.status, "Ativo");

    const comPai = categorySchema.safeParse({
      codigo: "CAT-SUB",
      nome: "Importado",
      categoriaPaiId: "55555555-5555-5555-5555-555555555555",
    });
    assert.equal(comPai.success, true);
  });
});

describe("brandSchema", () => {
  test("rejeita marca sem código/nome", () => {
    const result = brandSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita marca válida e aplica default de status", () => {
    const result = brandSchema.safeParse({ codigo: "MRC-0001", nome: "Marca Teste" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.status, "Ativo");
  });
});

describe("productSchema — categoria virou legado/opcional (Fase 2)", () => {
  test("aceita produto sem o campo categoria (categoriaId é a classificação real agora)", () => {
    const result = productSchema.safeParse({
      codigo: "PRD-0004",
      descricao: "Produto sem categoria em texto",
      unidade: "UN",
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.categoria, "");
  });

  test("ainda exige código, descrição e unidade", () => {
    const result = productSchema.safeParse({});
    assert.equal(result.success, false);
  });
});

describe("productSupplierSchema", () => {
  test("rejeita sem produto/fornecedor", () => {
    const result = productSupplierSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita vínculo mínimo e aplica defaults", () => {
    const result = productSupplierSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      fornecedorId: "22222222-2222-2222-2222-222222222222",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.preferencial, false);
      assert.equal(result.data.custo, 0);
      assert.equal(result.data.status, "Ativo");
    }
  });

  test("aceita custo, prazo e preferência informados", () => {
    const result = productSupplierSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      fornecedorId: "22222222-2222-2222-2222-222222222222",
      custo: 12.5,
      prazoEntregaDias: 7,
      preferencial: true,
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.custo, 12.5);
      assert.equal(result.data.preferencial, true);
    }
  });
});

describe("productPriceSchema", () => {
  test("rejeita sem produto/tipo de preço", () => {
    const result = productPriceSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("rejeita valor negativo", () => {
    const result = productPriceSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      tipoPreco: "sale",
      valor: -10,
    });
    assert.equal(result.success, false);
  });

  test("rejeita tipo de preço inválido", () => {
    const result = productPriceSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      tipoPreco: "atacado",
      valor: 10,
    });
    assert.equal(result.success, false);
  });

  test("aceita preço válido e aplica moeda padrão BRL", () => {
    const result = productPriceSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      tipoPreco: "sale",
      valor: 99.9,
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.moeda, "BRL");
  });
});

describe("productUnitSchema", () => {
  test("rejeita sem produto/unidade", () => {
    const result = productUnitSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("rejeita fator de conversão zero ou negativo", () => {
    const result = productUnitSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      unidadeCodigo: "CX",
      fatorConversao: 0,
    });
    assert.equal(result.success, false);
  });

  test("aceita embalagem válida e aplica fator de conversão padrão 1", () => {
    const result = productUnitSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      unidadeCodigo: "CX",
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.fatorConversao, 1);
  });
});
