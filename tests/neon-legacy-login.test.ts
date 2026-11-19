import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyLogin, type LegacyDeps } from "../src/lib/auth/neon/flows";

const AUTH_ID = "11111111-1111-4111-8111-111111111111";

function deps(over: Partial<LegacyDeps> = {}) {
  const calls: string[] = [];
  const d: LegacyDeps = {
    verifyLegacy: async (_e, p) => (p === "certa" ? { authUserId: AUTH_ID, name: "Ana" } : null),
    isMigrated: async () => false,
    findNeonUser: async () => null,
    createNeonUser: async (email, name, password) => (calls.push(`create:${email}:${name}:${password}`), { id: "neon-1", email, emailVerified: false } as never),
    setPassword: async (id, p) => void calls.push(`set:${id}:${p}`),
    markEmailVerified: async (id) => void calls.push(`verify:${id}`),
    link: async (n, e, a) => void calls.push(`link:${n}:${e}:${a}`),
    ...over,
  };
  return { d, calls };
}

test("senha certa no login antigo: cria no Neon com a mesma senha, confirma e vincula", async () => {
  const { d, calls } = deps();
  assert.equal(await migrateLegacyLogin("ana@x.com", "certa", d), true);
  assert.deepEqual(calls, ["create:ana@x.com:Ana:certa", "verify:neon-1", `link:neon-1:ana@x.com:${AUTH_ID}`]);
});

test("senha errada no login antigo: nada é criado", async () => {
  const { d, calls } = deps();
  assert.equal(await migrateLegacyLogin("ana@x.com", "errada", d), false);
  assert.deepEqual(calls, []);
});

test("conta já migrada: a senha antiga nunca sobrescreve a atual", async () => {
  const { d, calls } = deps({ isMigrated: async () => true });
  assert.equal(await migrateLegacyLogin("ana@x.com", "certa", d), false);
  assert.deepEqual(calls, []);
});

test("conta já existe no Neon sem vínculo (convite antigo): grava a senha e vincula", async () => {
  const { d, calls } = deps({ findNeonUser: async (email) => ({ id: "neon-9", email, emailVerified: false }) as never });
  assert.equal(await migrateLegacyLogin("ana@x.com", "certa", d), true);
  assert.deepEqual(calls, ["set:neon-9:certa", "verify:neon-9", `link:neon-9:ana@x.com:${AUTH_ID}`]);
});
