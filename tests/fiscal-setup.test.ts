// Orientação da primeira NF-e (src/lib/fiscal/setup.ts; E2E NOVA ORBITA, P9).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fiscalSetupSteps, type FiscalSetupStatus } from "../src/lib/fiscal/setup";

const vazio: FiscalSetupStatus = { establishments: 0, outbound_natures: 0, outbound_natures_with_cfop: 0, cfops: 0, ncms: 0, active_products: 0, products_with_ncm: 0, fiscal_series: 0 };

describe("fiscalSetupSteps", () => {
  test("empresa recém-criada: todos os passos pendentes, cada um dizendo o que falta", () => {
    const steps = fiscalSetupSteps(vazio);
    assert.equal(steps.length, 6); // rodada 2: + série de numeração (R2-09)
    assert.ok(steps.every((s) => !s.done));
    assert.match(steps.find((s) => s.id === "establishment")!.detail, /Nenhum cadastrado/);
  });

  test("natureza de saída sem CFOP padrão fica pendente e explica o motivo", () => {
    const nature = fiscalSetupSteps({ ...vazio, outbound_natures: 1 }).find((s) => s.id === "nature")!;
    assert.equal(nature.done, false);
    assert.match(nature.detail, /sem CFOP padrão/);
  });

  test("produtos: pronto só quando todos os ativos têm NCM", () => {
    const parcial = fiscalSetupSteps({ ...vazio, active_products: 3, products_with_ncm: 2 }).find((s) => s.id === "products")!;
    assert.equal(parcial.done, false);
    assert.match(parcial.detail, /2 de 3/);
    assert.match(parcial.detail, /perfil fiscal/);
    assert.equal(fiscalSetupSteps({ ...vazio, active_products: 3, products_with_ncm: 3 }).find((s) => s.id === "products")!.done, true);
  });

  test("tudo cadastrado: nenhum pendente", () => {
    const pronto: FiscalSetupStatus = { establishments: 1, outbound_natures: 1, outbound_natures_with_cfop: 1, cfops: 1, ncms: 1, active_products: 2, products_with_ncm: 2, fiscal_series: 1 };
    assert.ok(fiscalSetupSteps(pronto).every((s) => s.done));
  });

  test("R2-09: sem série de numeração a configuração NÃO está pronta (antes dizia 'pronto')", () => {
    const semSerie: FiscalSetupStatus = { establishments: 1, outbound_natures: 1, outbound_natures_with_cfop: 1, cfops: 1, ncms: 1, active_products: 2, products_with_ncm: 2, fiscal_series: 0 };
    const series = fiscalSetupSteps(semSerie).find((s) => s.id === "series")!;
    assert.equal(series.done, false);
    assert.match(series.detail, /não pode ser numerada/);
    assert.ok(!fiscalSetupSteps(semSerie).every((s) => s.done));
  });
});
