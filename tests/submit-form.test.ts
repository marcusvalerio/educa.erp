// Envio do formulário de saída a partir do menu da conta (useLogout): usa
// requestSubmit (evento "submit" + validação, como um botão), cai para
// submit() em navegador sem requestSubmit e não envia formulário ausente ou
// já desmontado — o caso que deixava a sessão ativa no clique do mouse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitForm } from "@/lib/session/submit-form";

const fakeForm = (opts: { requestSubmit?: boolean; isConnected?: boolean } = {}) => {
  const calls: string[] = [];
  const form = {
    submit: () => void calls.push("submit"),
    ...(opts.requestSubmit === false ? {} : { requestSubmit: () => void calls.push("requestSubmit") }),
    isConnected: opts.isConnected ?? true,
  };
  return { form, calls };
};

test("usa requestSubmit quando existe", () => {
  const { form, calls } = fakeForm();
  assert.equal(submitForm(form), true);
  assert.deepEqual(calls, ["requestSubmit"]);
});

test("cai para submit() sem requestSubmit", () => {
  const { form, calls } = fakeForm({ requestSubmit: false });
  assert.equal(submitForm(form), true);
  assert.deepEqual(calls, ["submit"]);
});

test("não envia formulário ausente ou desmontado", () => {
  assert.equal(submitForm(null), false);
  assert.equal(submitForm(undefined), false);
  const { form, calls } = fakeForm({ isConnected: false });
  assert.equal(submitForm(form), false);
  assert.deepEqual(calls, []);
});
