import { test } from "node:test";
import assert from "node:assert/strict";
import { changePasswordFlow, changePasswordSchema, type ChangePasswordDeps } from "../src/lib/auth/change-password";

function deps(over: Partial<ChangePasswordDeps> = {}) {
  const calls: string[] = [];
  const d: ChangePasswordDeps = {
    currentEmail: async () => "ana@x.com",
    verifyCurrent: async (email, p) => (calls.push(`verify:${email}`), p === "atual123"),
    apply: async (input) => void calls.push(`apply:${input.newPassword}`),
    ...over,
  };
  return { d, calls };
}

const input = { currentPassword: "atual123", newPassword: "nova12345" };

test("troca: confere a senha atual da sessão e grava a nova", async () => {
  const { d, calls } = deps();
  assert.equal(await changePasswordFlow(input, d), "changed");
  assert.deepEqual(calls, ["verify:ana@x.com", "apply:nova12345"]);
});

test("senha atual errada: nada é gravado", async () => {
  const { d, calls } = deps();
  assert.equal(await changePasswordFlow({ ...input, currentPassword: "errada1" }, d), "wrong_password");
  assert.deepEqual(calls, ["verify:ana@x.com"]);
});

test("sem sessão: nada é conferido nem gravado", async () => {
  const { d, calls } = deps({ currentEmail: async () => null });
  assert.equal(await changePasswordFlow(input, d), "no_session");
  assert.deepEqual(calls, []);
});

test("validação: política de senha, nova diferente da atual, sem campos extras", () => {
  assert.equal(changePasswordSchema.safeParse(input).success, true);
  assert.equal(changePasswordSchema.safeParse({ ...input, newPassword: "curta1" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...input, newPassword: "somenteletras" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "atual123", newPassword: "atual123" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...input, email: "outra@x.com" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...input, currentPassword: "" }).success, false);
});
