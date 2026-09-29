// Rótulos da trilha de auditoria em português (E2E NOVA ORBITA, P14).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { STATUS_REGISTRY, statusMeta } from "@/lib/status";
import { auditEntityLabel } from "@/lib/audit-labels";

// Ações aceitas por audit_logs_action_check (banco).
const DB_ACTIONS = "ACTIVATE APPROVE ASSIGN AUTHORIZE CANCEL COMPLETE CONFIGURE CONFIRM CONSUME CREATE DELETE DELIVER DISABLE ENABLE EVENT EXPORT FAIL GRANT INACTIVATE PACK PAY PICK RECEIVE RECONCILE REJECT RELEASE RESERVE RESUME RETURN REVERSE REVOKE SCRAP SHIP START SUSPEND UNASSIGN UPDATE".split(" ");

describe("auditoria — rótulos", () => {
  test("toda ação aceita pelo banco tem rótulo em português", () => {
    const missing = DB_ACTIONS.filter((a) => !(a in STATUS_REGISTRY.audit_action));
    assert.deepEqual(missing, []);
    assert.equal(statusMeta("audit_action", "APPROVE").label, "Aprovação");
    assert.equal(statusMeta("audit_action", "RECEIVE").label, "Recebimento");
    assert.equal(statusMeta("audit_action", "CONFIRM").label, "Confirmação");
  });

  test("entidades técnicas viram rótulos; rótulos já em português passam", () => {
    assert.equal(auditEntityLabel("sales_orders"), "Pedido de venda");
    assert.equal(auditEntityLabel("accounts_receivable"), "Conta a receber");
    assert.equal(auditEntityLabel("fiscal_documents"), "Documento fiscal");
    assert.equal(auditEntityLabel("user_invitations"), "Convite de usuário");
    assert.equal(auditEntityLabel("Cliente"), "Cliente");
    assert.equal(auditEntityLabel("tabela_nova"), "tabela_nova", "desconhecida: mostra o nome técnico, não esconde");
  });
});
