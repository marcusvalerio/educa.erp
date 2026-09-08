import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cnhDiasRestantes, cnhAlertaTexto } from "@/lib/cadastros/columns";

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

describe("cnhDiasRestantes", () => {
  test("retorna negativo para CNH já vencida", () => {
    assert.equal(cnhDiasRestantes(daysFromNow(-10)) < 0, true);
  });

  test("retorna positivo para CNH distante do vencimento", () => {
    assert.equal(cnhDiasRestantes(daysFromNow(365)) > 300, true);
  });
});

describe("cnhAlertaTexto", () => {
  test("sinaliza CNH vencida", () => {
    assert.match(cnhAlertaTexto(daysFromNow(-5)), /vencida/);
  });

  test("sinaliza CNH a vencer dentro de 30 dias", () => {
    assert.match(cnhAlertaTexto(daysFromNow(15)), /a vencer/);
  });

  test("não sinaliza alerta para CNH regular", () => {
    const text = cnhAlertaTexto(daysFromNow(200));
    assert.equal(text.includes("vencida"), false);
    assert.equal(text.includes("a vencer"), false);
  });
});
