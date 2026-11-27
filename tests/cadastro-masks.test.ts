import { test } from "node:test";
import assert from "node:assert/strict";
import { maskCep, maskCpfCnpj } from "../src/lib/cadastros/masks";

test("máscara de CPF/CNPJ progressiva", () => {
  assert.equal(maskCpfCnpj("123"), "123");
  assert.equal(maskCpfCnpj("1234567"), "123.456.7");
  assert.equal(maskCpfCnpj("12345678901"), "123.456.789-01");
  assert.equal(maskCpfCnpj("123456780001"), "12.345.678/0001");
  assert.equal(maskCpfCnpj("12345678000199"), "12.345.678/0001-99");
  assert.equal(maskCpfCnpj("12.345.678/0001-99"), "12.345.678/0001-99");
  assert.equal(maskCpfCnpj("AB-1234"), "AB-1234");
});

test("máscara de CEP", () => {
  assert.equal(maskCep("01310"), "01310");
  assert.equal(maskCep("01310100"), "01310-100");
});
