import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  productSchema,
  customerSchema,
  driverSchema,
  vehicleSchema,
  userSchema,
  warehouseLocationSchema,
} from "@/lib/validations/cadastros";

describe("productSchema", () => {
  test("rejeita produto sem campos obrigatórios", () => {
    const result = productSchema.safeParse({});
    assert.equal(result.success, false);
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
