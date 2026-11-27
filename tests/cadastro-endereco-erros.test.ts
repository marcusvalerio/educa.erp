import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateCliente, validateFornecedor } from "@/lib/cadastros/validation";
import { ApiError, formatDecimalsPtBr } from "@/lib/database/errors";
import { PAISES_LABELS } from "@/lib/cadastros/constants";

describe("formatDecimalsPtBr", () => {
  test("converte decimais do banco para pt-BR sem zeros à direita", () => {
    assert.equal(formatDecimalsPtBr("disponível 10.0000 em estoque, solicitado 50.0000"), "disponível 10 em estoque, solicitado 50");
    assert.equal(formatDecimalsPtBr("saldo 12.5000"), "saldo 12,5");
    assert.equal(formatDecimalsPtBr("saldo 1500.2500"), "saldo 1.500,25");
  });
  test("não altera códigos, IPs ou números sem ponto", () => {
    assert.equal(formatDecimalsPtBr("pedido PV-000123 versão 1.2.3 ip 10.0.0.1"), "pedido PV-000123 versão 1.2.3 ip 10.0.0.1");
    assert.equal(formatDecimalsPtBr("valor 1.23456"), "valor 1.23456");
  });
  test("ApiError aplica a formatação", () => {
    assert.equal(new ApiError("X", "saldo 200.0000").message, "saldo 200");
  });
});

describe("UF obrigatória com endereço", () => {
  const base = { tipo: "Pessoa Jurídica" as const, documento: "12.345.678/0001-90", pais: "BR" };
  test("cliente com cidade e sem UF", () => {
    const e = validateCliente({ ...base, nome: "X", cidade: "Curitiba", estado: "" }, []);
    assert.equal(e.estado, "Informe o Estado (UF) do endereço.");
  });
  test("fornecedor com CEP e sem UF", () => {
    const e = validateFornecedor({ ...base, razaoSocial: "X", cep: "80000-000" }, []);
    assert.equal(e.estado, "Informe o Estado (UF) do endereço.");
  });
  test("estrangeiro e endereço vazio não exigem UF", () => {
    assert.equal(validateCliente({ tipo: "Estrangeiro", nome: "X", documento: "TAX1", pais: "CN", cidade: "Xangai" }, []).estado, undefined);
    assert.equal(validateCliente({ ...base, nome: "X" }, []).estado, undefined);
  });
  test("rótulos de país incluem nome", () => {
    assert.equal(PAISES_LABELS.CN, "CN — China");
    assert.equal(PAISES_LABELS.US, "US — Estados Unidos");
  });
});
