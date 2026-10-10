// Tradução dos erros das funções SQL do CRM para a API (sem banco).
// Mensagens reais das funções 0055/0089 — antes, P0001 e 22023 viravam 500.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyCrmRpcError, crmUserMessage } from "@/lib/crm/errors";

describe("CRM — erros das funções do banco na API", () => {
  test("regra de estado (P0001) com situação atual → 409, com o rótulo em português", () => {
    const r = classifyCrmRpcError({ code: "P0001", message: "Oportunidade já está fechada (status atual: WON)." });
    assert.equal(r.status, 409);
    assert.equal(r.message, "Oportunidade já está fechada (situação atual: Ganha).");
  });

  test("dado que falta (P0001) → 422 e sem nome de função na mensagem", () => {
    const r = classifyCrmRpcError({ code: "P0001", message: "Oportunidade ainda não tem cliente vinculado — converta o lead em cliente antes (fn_convert_lead_to_customer)." });
    assert.equal(r.status, 422);
    assert.doesNotMatch(r.message, /fn_/);
    assert.match(r.message, /converta o lead em cliente antes\.$/);
  });

  test("lead sem documento (0089) → 422; oportunidade aberta repetida (0089) → 409", () => {
    assert.equal(classifyCrmRpcError({ code: "P0001", message: "O lead LEAD-0003 não tem CPF/CNPJ. Informe o documento no lead antes de convertê-lo em cliente." }).status, 422);
    assert.equal(classifyCrmRpcError({ code: "P0001", message: "O lead LEAD-0004 já tem a oportunidade OPP-0002 em aberto. Continue por ela (ou encerre-a antes de criar outra)." }).status, 409);
  });

  test("orçamento em rascunho → 409 com 'Rascunho' (situação do orçamento, não do pedido)", () => {
    const r = classifyCrmRpcError({ code: "P0001", message: "Só é possível gerar pedido a partir de um orçamento aprovado (status atual: draft)." });
    assert.equal(r.status, 409);
    assert.match(r.message, /situação atual: Rascunho/);
  });

  test("parâmetro inválido (22023) → 422; FK (23503) → 422 sem texto técnico", () => {
    assert.equal(classifyCrmRpcError({ code: "22023", message: "Estágio não pertence ao pipeline desta oportunidade." }).status, 422);
    const fk = classifyCrmRpcError({ code: "23503", message: 'insert or update on table "opportunities" violates foreign key constraint "opportunities_stage_id_pipeline_id_fkey"' });
    assert.equal(fk.status, 422);
    assert.doesNotMatch(fk.message, /violates|constraint|opportunities_/);
  });

  test("permissão (42501) → 403; não encontrado (P0002) → 404; desconhecido → fica para o tradutor geral", () => {
    assert.equal(classifyCrmRpcError({ code: "42501", message: "Permissão negada (leads.convert)." }).status, 403);
    assert.equal(classifyCrmRpcError({ code: "P0002", message: "Lead não encontrado." }).status, 404);
    assert.equal(classifyCrmRpcError({ code: "XX000", message: "erro interno" }).status, null);
  });

  test("mensagem sem código de situação continua igual", () => {
    assert.equal(crmUserMessage("Lead não encontrado."), "Lead não encontrado.");
  });
});
