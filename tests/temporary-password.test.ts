// Senha provisória (0095) no servidor: geração, ordem das chamadas ao banco e
// ao Neon Auth, compensação quando o provedor falha e troca obrigatória no
// primeiro login. Dublês com registro de chamadas; nada de rede.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NeonAuthError, type NeonUser } from "@/lib/auth/neon/client";
import {
  changeTemporaryPasswordFlow,
  generateDiscardPassword,
  generateTemporaryPassword,
  issueTemporaryPasswordFlow,
  revokeTemporaryPasswordFlow,
  temporaryPasswordBlock,
  TemporaryPasswordError,
  TEMPORARY_PASSWORD_LENGTH,
  type ChangeDeps,
  type IssueDeps,
} from "@/lib/auth/neon/temporary-password";
import { newPasswordSchema } from "@/lib/onboarding/invitations";

const neonUser = (over: Partial<NeonUser> = {}): NeonUser => ({ id: "neon-1", email: "pessoa@empresa.com", emailVerified: false, name: "Pessoa", banned: false, ...over });

describe("geração", () => {
  test("10 caracteres, sem 0/O/o/1/l/I, com maiúscula, minúscula e número (passa na política de senha)", () => {
    for (let i = 0; i < 500; i++) {
      const p = generateTemporaryPassword();
      assert.equal(p.length, TEMPORARY_PASSWORD_LENGTH);
      assert.match(p, /^[A-HJ-NP-Za-km-np-z2-9]+$/);
      assert.match(p, /[A-Z]/);
      assert.match(p, /[a-z]/);
      assert.match(p, /\d/);
      assert.ok(newPasswordSchema.safeParse(p).success, p);
    }
  });

  test("sorteio sem classe obrigatória é descartado e sorteado de novo", () => {
    let n = 0;
    // 1ª rodada só "A" (índice 0); depois varia.
    const p = generateTemporaryPassword(() => (n++ < 10 ? 0 : n % 56));
    assert.notEqual(p, "AAAAAAAAAA");
    assert.equal(p.length, 10);
  });

  test("senhas não se repetem e a de descarte é longa", () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateTemporaryPassword()));
    assert.equal(set.size, 2000);
    assert.ok(generateDiscardPassword().length >= 40);
  });
});

function issueWorld(over: Partial<IssueDeps> = {}) {
  const calls: string[] = [];
  const deps: IssueDeps = {
    issueRecord: async () => (calls.push("issue"), { id: "rec-1", email: " Pessoa@Empresa.com ", userName: "Pessoa", authUserId: null, expiresAt: "2026-10-18T12:00:00Z" }),
    revokeRecord: async () => void calls.push("revoke"),
    ensureShadowLogin: async (email) => (calls.push(`shadow:${email}`), "auth-1"),
    attachLogin: async (id, auth) => void calls.push(`attach:${id}:${auth}`),
    findNeonUser: async () => (calls.push("find"), null),
    createNeonUser: async (email, name) => (calls.push(`create:${email}:${name}`), neonUser()),
    link: async (n, e, a) => void calls.push(`link:${n}:${e}:${a}`),
    setPassword: async (n) => void calls.push(`setPassword:${n}`),
    markEmailVerified: async (n) => void calls.push(`verify:${n}`),
    revokeSessions: async (n) => void calls.push(`sessions:${n}`),
    generate: () => "K7mP4xR9tQ",
    ...over,
  };
  return { calls, deps };
}

describe("gerar", () => {
  test("cadastro sem login: banco autoriza → login-sombra → banco confere o login → identidade → senha → sessões", async () => {
    const { calls, deps } = issueWorld();
    const r = await issueTemporaryPasswordFlow(deps);
    assert.deepEqual(r, { password: "K7mP4xR9tQ", email: "pessoa@empresa.com", userName: "Pessoa", expiresAt: "2026-10-18T12:00:00Z" });
    assert.deepEqual(calls, [
      "issue",
      "shadow:pessoa@empresa.com",
      "attach:rec-1:auth-1",
      "find",
      "create:pessoa@empresa.com:Pessoa",
      "link:neon-1:pessoa@empresa.com:auth-1",
      "setPassword:neon-1",
      "verify:neon-1",
      "sessions:neon-1",
    ]);
  });

  test("conta já ativa: usa o login do cadastro, não cria identidade nem reconfirma e-mail", async () => {
    const { calls, deps } = issueWorld({
      issueRecord: async () => ({ id: "rec-2", email: "pessoa@empresa.com", userName: "Pessoa", authUserId: "auth-9", expiresAt: "x" }),
      findNeonUser: async () => neonUser({ emailVerified: true }),
    });
    await issueTemporaryPasswordFlow(deps);
    assert.ok(!calls.some((c) => c.startsWith("shadow") || c.startsWith("create") || c.startsWith("verify")), calls.join());
    assert.ok(calls.includes("attach:rec-2:auth-9"));
  });

  test("banco recusa o login (outro cadastro/plataforma): nenhuma senha é gravada e a pendência é revogada", async () => {
    const { calls, deps } = issueWorld({
      attachLogin: async () => {
        throw new Error("Este e-mail já tem login em outro cadastro");
      },
    });
    await assert.rejects(issueTemporaryPasswordFlow(deps), /outro cadastro/);
    assert.ok(!calls.some((c) => c.startsWith("setPassword")));
    assert.equal(calls.at(-1), "revoke");
  });

  test("Neon fora do ar ao gravar a senha: pendência revogada (não deixa a conta bloqueada)", async () => {
    const { calls, deps } = issueWorld({
      setPassword: async () => {
        throw new NeonAuthError("UNAVAILABLE", 503, "x");
      },
    });
    await assert.rejects(issueTemporaryPasswordFlow(deps), NeonAuthError);
    assert.equal(calls.at(-1), "revoke");
  });

  test("banco nega (outra empresa, sem permissão): nada acontece no provedor", async () => {
    const { calls, deps } = issueWorld({
      issueRecord: async () => {
        throw new Error("Permissão negada (users.update).");
      },
    });
    await assert.rejects(issueTemporaryPasswordFlow(deps), /Permissão negada/);
    assert.deepEqual(calls, []);
  });

  test("corrida na criação da identidade: reaproveita a existente", async () => {
    let finds = 0;
    const { deps } = issueWorld({
      findNeonUser: async () => (finds++ === 0 ? null : neonUser({ id: "neon-x" })),
      createNeonUser: async () => {
        throw new NeonAuthError("USER_EXISTS", 409, "x");
      },
    });
    const r = await issueTemporaryPasswordFlow(deps);
    assert.equal(r.password, "K7mP4xR9tQ");
  });
});

describe("revogar", () => {
  test("sem pendente: não toca no provedor", async () => {
    const calls: string[] = [];
    const r = await revokeTemporaryPasswordFlow({
      revokeRecord: async () => ({ revoked: false, email: "p@e.com" }),
      findNeonUser: async () => (calls.push("find"), neonUser()),
      setPassword: async () => void calls.push("set"),
      revokeSessions: async () => void calls.push("sessions"),
    });
    assert.deepEqual(r, { revoked: false });
    assert.deepEqual(calls, []);
  });

  test("com pendente: a provisória vira uma senha que ninguém conhece e as sessões caem", async () => {
    const calls: string[] = [];
    await revokeTemporaryPasswordFlow({
      revokeRecord: async () => ({ revoked: true, email: "P@E.com" }),
      findNeonUser: async (e) => (calls.push(`find:${e}`), neonUser()),
      setPassword: async (_n, p) => void calls.push(`set:${p.length >= 40}`),
      revokeSessions: async (n) => void calls.push(`sessions:${n}`),
    });
    assert.deepEqual(calls, ["find:p@e.com", "set:true", "sessions:neon-1"]);
  });
});

function changeWorld(over: Partial<ChangeDeps> = {}) {
  const calls: string[] = [];
  const deps: ChangeDeps = {
    signIn: async (e, p) => (calls.push(`signIn:${p}`), { cookie: `c-${p}`, user: neonUser() }),
    resolve: async (cookie) => (calls.push(`resolve:${cookie}`), { status: "ok", identity: { authUserId: "auth-1", email: "pessoa@empresa.com", neonUserId: "neon-1", dbToken: "" }, renewedCookie: null }),
    signOut: async (c) => void calls.push(`signOut:${c}`),
    state: async (n) => (calls.push(`state:${n}`), { id: "rec-1", authUserId: "auth-1", status: "pending" }),
    changePassword: async (c, cur, next) => void calls.push(`change:${c}:${cur}->${next}`),
    consume: async (id, a) => void calls.push(`consume:${id}:${a}`),
    ...over,
  };
  return { calls, deps };
}
const input = { email: "pessoa@empresa.com", temporaryPassword: "K7mP4xR9tQ", newPassword: "MinhaSenha2026" };

describe("troca obrigatória no primeiro login", () => {
  test("entra com a provisória, troca, consome, encerra a sessão antiga e só então cria a sessão nova", async () => {
    const { calls, deps } = changeWorld();
    const r = await changeTemporaryPasswordFlow(input, deps);
    assert.deepEqual(r, { status: "ok", cookie: "c-MinhaSenha2026" });
    assert.deepEqual(calls, [
      "signIn:K7mP4xR9tQ",
      "state:neon-1",
      "change:c-K7mP4xR9tQ:K7mP4xR9tQ->MinhaSenha2026",
      "consume:rec-1:auth-1",
      "signOut:c-K7mP4xR9tQ",
      "signIn:MinhaSenha2026",
      "resolve:c-MinhaSenha2026",
    ]);
  });

  test("senha nova igual à provisória: recusada antes de qualquer chamada", async () => {
    const { calls, deps } = changeWorld();
    await assert.rejects(changeTemporaryPasswordFlow({ ...input, newPassword: input.temporaryPassword }, deps), (e) => e instanceof TemporaryPasswordError && e.code === "SAME_PASSWORD");
    assert.deepEqual(calls, []);
  });

  test("senha provisória errada: erro de credencial, nada trocado", async () => {
    const { calls, deps } = changeWorld({
      signIn: async () => {
        throw new NeonAuthError("INVALID_CREDENTIALS", 401, "x");
      },
    });
    await assert.rejects(changeTemporaryPasswordFlow(input, deps), NeonAuthError);
    assert.ok(!calls.some((c) => c.startsWith("change") || c.startsWith("consume")));
  });

  test("vencida: não troca, encerra a sessão do provedor", async () => {
    const { calls, deps } = changeWorld({ state: async () => ({ id: "rec-1", authUserId: "auth-1", status: "expired" }) });
    await assert.rejects(changeTemporaryPasswordFlow(input, deps), (e) => e instanceof TemporaryPasswordError && e.code === "EXPIRED");
    assert.ok(!calls.some((c) => c.startsWith("change")));
    assert.deepEqual(calls.at(-1), "signOut:c-K7mP4xR9tQ");
  });

  test("conta sem provisória pendente: não usa esta rota para trocar senha", async () => {
    const { calls, deps } = changeWorld({ state: async () => null });
    await assert.rejects(changeTemporaryPasswordFlow(input, deps), (e) => e instanceof TemporaryPasswordError && e.code === "NOT_PENDING");
    assert.ok(!calls.some((c) => c.startsWith("change")));
  });

  test("banco recusa o consumo (ex.: cadastro desativado no meio): nenhuma sessão do ATLAS.ERP é criada", async () => {
    const { calls, deps } = changeWorld({
      consume: async () => {
        throw new Error("O acesso deste cadastro está desativado.");
      },
    });
    await assert.rejects(changeTemporaryPasswordFlow(input, deps), /desativado/);
    assert.ok(!calls.includes("signIn:MinhaSenha2026"));
  });

  test("bloqueio no login: pendente → pedir senha nova; vencida → avisar; sem registro → nada", () => {
    assert.equal(temporaryPasswordBlock({ id: "1", authUserId: "a", status: "pending" }), "change_required");
    assert.equal(temporaryPasswordBlock({ id: "1", authUserId: "a", status: "expired" }), "expired");
    assert.equal(temporaryPasswordBlock(null), null);
  });
});
