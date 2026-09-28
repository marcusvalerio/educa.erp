// Identificação do ambiente (APP_ENV): só "homologacao" liga o selo; qualquer
// outro valor — inclusive ausente — é produção, que não muda de aparência.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppEnvironment } from "@/lib/environment";

test("APP_ENV=homologacao identifica a homologação", () => {
  assert.equal(parseAppEnvironment("homologacao"), "homologacao");
  assert.equal(parseAppEnvironment(" Homologacao "), "homologacao");
});

test("sem APP_ENV, ou com outro valor, o ambiente é produção", () => {
  assert.equal(parseAppEnvironment(undefined), "producao");
  assert.equal(parseAppEnvironment(""), "producao");
  assert.equal(parseAppEnvironment("production"), "producao");
  assert.equal(parseAppEnvironment("homolog"), "producao");
});
