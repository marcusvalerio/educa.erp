import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reservationFeedback } from "@/lib/reservation-feedback";
import { MOVEMENT_TYPE_OPTIONS, movementTypeLabel, referenceTypeLabel } from "@/lib/stock-labels";
import { pickName } from "@/lib/useIdNameLookup";

describe("reservationFeedback (B5: reserva parcial não é anunciada como sucesso)", () => {
  it("reserva completa", () => {
    const f = reservationFeedback(0, 10, 10);
    assert.equal(f.tone, "success");
    assert.equal(f.title, "Estoque reservado.");
    assert.equal(f.description, "10 de 10 unidades reservadas.");
  });

  it("completa o pendente de uma reserva parcial anterior", () => {
    const f = reservationFeedback(2, 5, 5);
    assert.equal(f.tone, "success");
    assert.equal(f.description, "5 de 5 unidades reservadas.");
  });

  it("reserva parcial", () => {
    const f = reservationFeedback(0, 2, 5);
    assert.equal(f.tone, "warning");
    assert.equal(f.title, "Reserva parcial.");
    assert.match(f.description, /^2 unidades reservadas neste local; 3 unidades ficaram pendentes\./);
  });

  it("concorda o singular", () => {
    const f = reservationFeedback(0, 1, 2);
    assert.match(f.description, /^1 unidade reservada neste local; 1 unidade ficou pendente\./);
    assert.equal(reservationFeedback(0, 1, 1).description, "1 de 1 unidade reservada.");
  });

  it("nada reservado no local escolhido", () => {
    const f = reservationFeedback(2, 2, 5);
    assert.equal(f.tone, "warning");
    assert.equal(f.title, "Nenhuma unidade reservada.");
  });
});

describe("rótulos das movimentações (D5)", () => {
  it("traduz reserva e liberação", () => {
    assert.equal(movementTypeLabel("RESERVATION"), "Reserva");
    assert.equal(movementTypeLabel("RELEASE"), "Liberação de reserva");
    assert.equal(movementTypeLabel("RECEIPT"), "Entrada");
  });

  it("traduz as origens nas duas grafias do banco", () => {
    assert.equal(referenceTypeLabel("PURCHASE_RECEIPT"), "Recebimento de compra");
    assert.equal(referenceTypeLabel("stock_reservation"), "Reserva de pedido");
    assert.equal(referenceTypeLabel("stock_transfer"), "Transferência entre locais");
    assert.equal(referenceTypeLabel("SHIPMENT"), "Expedição");
    assert.equal(referenceTypeLabel("manual"), "Lançamento avulso");
    assert.equal(referenceTypeLabel("MANUAL"), "Lançamento avulso");
  });

  it("código desconhecido aparece como está, vazio vira travessão", () => {
    assert.equal(movementTypeLabel("NOVO_TIPO"), "NOVO_TIPO");
    assert.equal(referenceTypeLabel("outra_origem"), "outra_origem");
    assert.equal(referenceTypeLabel(null), "—");
  });

  it("o filtro Tipo oferece os tipos de reserva", () => {
    assert.ok(MOVEMENT_TYPE_OPTIONS.some(([value]) => value === "RESERVATION"));
  });
});

describe("pickName (D8: local de estoque sem descrição)", () => {
  it("usa a descrição quando existe", () => {
    assert.equal(pickName({ codigoLocal: "PCK-A01", descricao: "Picking — rua A" }, "name"), "Picking — rua A");
  });

  it("cai no código do local quando a descrição está vazia", () => {
    assert.equal(pickName({ codigoLocal: "PCK-A01", descricao: "" }, "name"), "PCK-A01");
  });
});
