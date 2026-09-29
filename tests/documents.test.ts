// CPF/CNPJ com dígitos verificadores (src/lib/documents.ts) e sua aplicação
// na empresa, no estabelecimento fiscal e no cliente (E2E NOVA ORBITA, P5–P7).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cnpjError, cpfError, isValidCnpj, isValidCpf, personDocumentError, taxIdError } from "../src/lib/documents";
import { createCompanySchema } from "../src/lib/onboarding/invitations";
import { fiscalEstablishmentBaseSchema, fiscalEstablishmentSchema } from "../src/lib/validations/fiscal";
import { validateCliente } from "../src/lib/cadastros/validation";
import type { Cliente } from "../src/lib/cadastros/types";

describe("CNPJ e CPF", () => {
  test("CNPJ válido, com e sem máscara", () => {
    assert.equal(isValidCnpj("11.222.333/0001-81"), true);
    assert.equal(isValidCnpj("11222333000181"), true);
    assert.equal(cnpjError("11.222.333/0001-81"), null);
  });

  test("CNPJ com dígitos verificadores errados", () => {
    assert.equal(isValidCnpj("11.222.333/0001-80"), false);
    assert.equal(cnpjError("11.222.333/0001-80"), "CNPJ inválido: confira os dígitos verificadores.");
    assert.equal(isValidCnpj("00.000.000/0000-00"), false, "dígitos todos iguais (usado no E2E)");
    assert.equal(isValidCnpj("11.111.111/1111-11"), false, "dígitos todos iguais (usado no E2E)");
  });

  test("CNPJ com formato inválido", () => {
    assert.equal(cnpjError("123"), "CNPJ deve conter 14 dígitos.");
    assert.equal(cnpjError(""), "CNPJ deve conter 14 dígitos.");
  });

  test("CPF válido e inválido", () => {
    assert.equal(isValidCpf("529.982.247-25"), true);
    assert.equal(cpfError("529.982.247-24"), "CPF inválido: confira os dígitos verificadores.");
    assert.equal(cpfError("111.111.111-11"), "CPF inválido: confira os dígitos verificadores.");
    assert.equal(cpfError("123"), "CPF deve conter 11 dígitos.");
  });

  test("documento de pessoa segue o tipo; documento livre aceita CNPJ ou CPF", () => {
    assert.equal(personDocumentError("Pessoa Jurídica", "529.982.247-25"), "CNPJ deve conter 14 dígitos.");
    assert.equal(personDocumentError("Pessoa Física", "529.982.247-25"), null);
    assert.equal(taxIdError("11222333000181"), null);
    assert.equal(taxIdError("52998224725"), null);
    assert.equal(taxIdError("1234"), "Informe um CNPJ (14 dígitos) ou CPF (11 dígitos).");
  });
});

describe("P5 — empresa (Central → Nova empresa)", () => {
  const base = { name: "Nova Orbita" };
  test("sem documento: permitido (campo opcional)", () => {
    assert.equal(createCompanySchema.safeParse(base).success, true);
    assert.equal(createCompanySchema.safeParse({ ...base, document: "" }).success, true);
  });
  test("CNPJ válido aceito; inválido recusado com a mensagem do campo", () => {
    assert.equal(createCompanySchema.safeParse({ ...base, document: "11.222.333/0001-81" }).success, true);
    const r = createCompanySchema.safeParse({ ...base, document: "00.000.000/0000-00" });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.error.issues[0]?.message, "CNPJ inválido: confira os dígitos verificadores.");
      assert.deepEqual(r.error.issues[0]?.path, ["document"]);
    }
  });
});

describe("P6 — estabelecimento fiscal", () => {
  const base = { code: "MATRIZ", name: "Matriz", taxRegime: "SIMPLES_NACIONAL" as const };
  test("criação exige CNPJ válido", () => {
    assert.equal(fiscalEstablishmentSchema.safeParse({ ...base, cnpj: "11.222.333/0001-81" }).success, true);
    const r = fiscalEstablishmentSchema.safeParse({ ...base, cnpj: "00.000.000/0000-00" });
    assert.equal(r.success, false);
    if (!r.success) assert.match(r.error.issues[0]!.message, /dígitos verificadores/);
    assert.equal(fiscalEstablishmentSchema.safeParse({ ...base, cnpj: "123" }).success, false);
  });
  test("alteração usa o esquema base (o handler só revalida CNPJ alterado)", () => {
    assert.equal(fiscalEstablishmentBaseSchema.partial().safeParse({ name: "Matriz SP" }).success, true);
  });
});

describe("P7 — cliente (formulário; a API aplica a mesma regra)", () => {
  const cliente = (over: Partial<Cliente>): Partial<Cliente> => ({ tipo: "Pessoa Jurídica", nome: "Cliente", documento: "", ...over });
  const antigo = { id: "c1", tipo: "Pessoa Jurídica", nome: "Antigo", documento: "90.098.897/0001-59" } as Cliente;

  test("novo cliente: CNPJ com dígitos repetidos é recusado", () => {
    assert.equal(validateCliente(cliente({ documento: "11.111.111/1111-11" }), []).documento, "CNPJ inválido: confira os dígitos verificadores.");
  });
  test("novo cliente: CNPJ válido aceito; vazio continua obrigatório", () => {
    assert.equal(validateCliente(cliente({ documento: "11.222.333/0001-81" }), []).documento, undefined);
    assert.equal(validateCliente(cliente({ documento: "" }), []).documento, "Informe o CPF/CNPJ.");
  });
  test("edição de cliente antigo sem mudar o documento não é bloqueada", () => {
    assert.equal(validateCliente({ ...antigo, nome: "Antigo (editado)" }, [antigo], "c1").documento, undefined);
  });
  test("edição que troca o documento revalida", () => {
    assert.match(validateCliente({ ...antigo, documento: "11.222.333/0001-80" }, [antigo], "c1").documento ?? "", /dígitos verificadores/);
  });
  test("duplicidade continua recusada", () => {
    const outro = { id: "c2", tipo: "Pessoa Jurídica", nome: "Outro", documento: "11.222.333/0001-81" } as Cliente;
    assert.equal(validateCliente(cliente({ documento: "11222333000181" }), [outro]).documento, "Já existe um cliente com este documento.");
  });
});
