// Testes de formatação compartilhada (src/lib/format.ts, Fase 19).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatCurrencyBRL, formatInteger, formatPercent, percentChange, formatDate, formatDateTime } from "@/lib/format";

describe("formatCurrencyBRL / formatInteger / formatPercent", () => {
  test("formatCurrencyBRL formata em R$ e trata null/undefined", () => {
    assert.equal(formatCurrencyBRL(1234.5), "R$ 1.234,50");
    assert.equal(formatCurrencyBRL(null), "—");
    assert.equal(formatCurrencyBRL(undefined), "—");
  });

  test("formatInteger formata com separador de milhar", () => {
    assert.equal(formatInteger(12345), "12.345");
    assert.equal(formatInteger(null), "—");
  });

  test("formatPercent formata com vírgula decimal", () => {
    assert.equal(formatPercent(42.567, 1), "42,6%");
    assert.equal(formatPercent(null), "—");
  });
});

describe("formatDate / formatDateTime", () => {
  test("formata data ISO (yyyy-mm-dd) e trata valor ausente", () => {
    assert.equal(formatDate("2025-03-10"), "10/03/2025");
    assert.equal(formatDate(null), "—");
    assert.equal(formatDate(undefined), "—");
  });

  test("formatDateTime trata valor inválido sem lançar erro", () => {
    assert.equal(formatDateTime("not-a-date"), "—");
  });
});

describe("percentChange — variação real entre dois períodos, nunca um valor fictício", () => {
  test("calcula variação positiva e negativa", () => {
    assert.equal(percentChange(120, 100), 20);
    assert.equal(percentChange(80, 100), -20);
  });

  test("retorna 0 quando ambos os períodos são zero", () => {
    assert.equal(percentChange(0, 0), 0);
  });

  test("retorna null quando o período anterior é zero mas o atual não (variação indefinida, nunca inventada)", () => {
    assert.equal(percentChange(100, 0), null);
  });
});
