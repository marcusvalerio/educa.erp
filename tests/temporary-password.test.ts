// Senha provisória (Supabase Auth): geração, ordem das chamadas ao banco e
// ao Auth, recusa de contas em uso, compensação e troca obrigatória no
// primeiro login. Dublês com registro de chamadas; nada de rede.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  changeTemporaryPasswordFlow,
  generateDiscardPassword,
  generateTemporaryPassword,
  issueTemporaryPasswordFlow,
  readTemporaryMeta,
  revokeTemporaryPasswordFlow,
  temporaryPasswordBlock,
  TemporaryPasswordError,
  TEMPORARY_PASSWORD_LENGTH,
  TEMPORARY_PASSWORD_META,
  type ChangeDeps,
  type IssueDeps,
} from "@/lib/auth/temporary-password";
import { newPasswordSchema } from "@/lib/onboarding/invitations";

const META = { invitation_id: "inv-1", invitation_token: "tok-1", user_id: "user-1", expires_at: "2026-10-19T12:00:00Z" };
const withMeta = (extra: Record<string, unknown> = {}) => ({ provider: "email", ...extra, [TEMPORARY_PASSWORD_META]: META });

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
    createInvitation: async () => (calls.push("invite"), { invitationId: "inv-1", token: "tok-1", email: " Pessoa@Empresa.com ", userId: "user-1", userName: "Pessoa", expiresAt: META.expires_at }),
    revokeInvitation: async (id) => void calls.push(`revoke:${id}`),
    findLogin: async (email) => (calls.push(`find:${email}`), null),
    loginInUse: async (id) => (calls.push(`inUse:${id}`), false),
    createLogin: async (email, password, meta) => void calls.push(`create:${email}:${password}:${JSON.stringify(meta)}`),
    updateLogin: async (id, change) => void calls.push(`update:${id}:${change.password}:${JSON.stringify(change.appMetadata)}`),
    generate: () => "K7mP4xR9tQ",
    ...over,
  };
  return { calls, deps };
}

describe("gerar (Administrador)", () => {
  test("cadastro sem login: banco autoriza (convite) → login criado com a provisória e a marca", async () => {
    const { calls, deps } = issueWorld();
    const r = await issueTemporaryPasswordFlow(deps);
    assert.deepEqual(r, { password: "K7mP4xR9tQ", email: "pessoa@empresa.com", userName: "Pessoa", expiresAt: META.expires_at });
    assert.deepEqual(calls, ["invite", "find:pessoa@empresa.com", `create:pessoa@empresa.com:K7mP4xR9tQ:${JSON.stringify({ [TEMPORARY_PASSWORD_META]: META })}`]);
  });

  test("banco nega (outra empresa, sem permissão, já tem login): nada acontece no Auth", async () => {
    const { calls, deps } = issueWorld({
      createInvitation: async () => {
        throw new Error("Permissão negada (users.update).");
      },
    });
    await assert.rejects(issueTemporaryPasswordFlow(deps), /Permissão negada/);
    assert.deepEqual(calls, []);
  });

  test("login já ligado a um cadastro ou à plataforma: recusa sem trocar senha e cancela o convite", async () => {
    const { calls, deps } = issueWorld({
      findLogin: async () => ({ id: "auth-9", appMetadata: {}, lastSignInAt: null }),
      loginInUse: async () => true,
    });
    await assert.rejects(issueTemporaryPasswordFlow(deps), (e) => e instanceof TemporaryPasswordError && e.code === "ACCOUNT_IN_USE");
    assert.ok(!calls.some((c) => c.startsWith("update") || c.startsWith("create")));
    assert.equal(calls.at(-1), "revoke:inv-1");
  });

  test("conta solta que já entrou com senha própria: recusa (não sequestra conta)", async () => {
    const { calls, deps } = issueWorld({ findLogin: async () => ({ id: "auth-9", appMetadata: { provider: "email" }, lastSignInAt: "2026-10-01T00:00:00Z" }) });
    await assert.rejects(issueTemporaryPasswordFlow(deps), (e) => e instanceof TemporaryPasswordError && e.code === "ACCOUNT_IN_USE");
    assert.ok(!calls.some((c) => c.startsWith("update")));
  });

  test("gerar de novo (provisória anterior): substitui a senha e a marca, mantém o resto do app_metadata", async () => {
    const { calls, deps } = issueWorld({
      createInvitation: async () => ({ invitationId: "inv-2", token: "tok-2", email: "pessoa@empresa.com", userId: "user-1", userName: "Pessoa", expiresAt: "x" }),
      findLogin: async () => ({ id: "auth-1", appMetadata: withMeta(), lastSignInAt: "2026-10-16T00:00:00Z" }),
    });
    await issueTemporaryPasswordFlow(deps);
    const update = calls.find((c) => c.startsWith("update:"))!;
    assert.match(update, /^update:auth-1:K7mP4xR9tQ:/);
    const meta = JSON.parse(update.split(":K7mP4xR9tQ:")[1]);
    assert.equal(meta.provider, "email");
    assert.equal(meta[TEMPORARY_PASSWORD_META].invitation_token, "tok-2");
  });

  test("login criado por convite por e-mail e nunca usado: recebe a provisória", async () => {
    const { calls, deps } = issueWorld({ findLogin: async () => ({ id: "auth-5", appMetadata: { provider: "email" }, lastSignInAt: null }) });
    await issueTemporaryPasswordFlow(deps);
    assert.ok(calls.some((c) => c.startsWith("update:auth-5:K7mP4xR9tQ")));
  });

  test("Auth fora do ar: convite desta tentativa é cancelado", async () => {
    const { calls, deps } = issueWorld({
      createLogin: async () => {
        throw new Error("Auth indisponível");
      },
    });
    await assert.rejects(issueTemporaryPasswordFlow(deps), /indisponível/);
    assert.equal(calls.at(-1), "revoke:inv-1");
  });
});

describe("revogar (Administrador)", () => {
  test("sem convite pendente: não toca no Auth", async () => {
    const calls: string[] = [];
    const r = await revokeTemporaryPasswordFlow({
      pendingInvitation: async () => null,
      revokeInvitation: async () => void calls.push("revoke"),
      findLogin: async () => (calls.push("find"), null),
      updateLogin: async () => void calls.push("update"),
    });
    assert.deepEqual(r, { revoked: false });
    assert.deepEqual(calls, []);
  });

  test("com pendente: banco revoga; a provisória vira uma senha que ninguém conhece e a marca sai", async () => {
    const calls: string[] = [];
    await revokeTemporaryPasswordFlow({
      pendingInvitation: async () => ({ id: "inv-1", email: "P@E.com", userId: "user-1" }),
      revokeInvitation: async (id) => void calls.push(`revoke:${id}`),
      findLogin: async (e) => (calls.push(`find:${e}`), { id: "auth-1", appMetadata: withMeta(), lastSignInAt: null }),
      updateLogin: async (id, change) => void calls.push(`update:${id}:${change.password!.length >= 40}:${TEMPORARY_PASSWORD_META in change.appMetadata}:${change.appMetadata.provider}`),
    });
    assert.deepEqual(calls, ["revoke:inv-1", "find:p@e.com", "update:auth-1:true:false:email"]);
  });

  test("login com provisória de OUTRO cadastro: só o convite é revogado", async () => {
    const calls: string[] = [];
    await revokeTemporaryPasswordFlow({
      pendingInvitation: async () => ({ id: "inv-7", email: "p@e.com", userId: "user-7" }),
      revokeInvitation: async (id) => void calls.push(`revoke:${id}`),
      findLogin: async () => ({ id: "auth-1", appMetadata: withMeta(), lastSignInAt: null }),
      updateLogin: async () => void calls.push("update"),
    });
    assert.deepEqual(calls, ["revoke:inv-7"]);
  });
});

function changeWorld(over: Partial<ChangeDeps> = {}) {
  const calls: string[] = [];
  let linked = false;
  const deps: ChangeDeps = {
    signIn: async (e, p) => (calls.push(`signIn:${e}:${p}`), { accessToken: `at-${p}`, login: { id: "auth-1", appMetadata: withMeta(), lastSignInAt: null } }),
    signOut: async (t) => void calls.push(`signOut:${t}`),
    invitationStatus: async (t) => (calls.push(`status:${t}`), "pending"),
    setPassword: async (id, p) => void calls.push(`setPassword:${id}:${p}`),
    accept: async (t, tok) => {
      calls.push(`accept:${t}:${tok}`);
      linked = true;
    },
    linkedTo: async (a, u) => (calls.push(`linked:${a}:${u}`), linked),
    clearMeta: async (id, meta) => void calls.push(`clear:${id}:${TEMPORARY_PASSWORD_META in meta}:${meta.provider}`),
    now: () => new Date("2026-10-17T00:00:00Z"),
    ...over,
  };
  return { calls, deps };
}
const input = { email: "Pessoa@Empresa.com", temporaryPassword: "K7mP4xR9tQ", newPassword: "MinhaSenha2026" };

describe("troca obrigatória no primeiro login", () => {
  test("entra com a provisória, confere convite, troca a senha, aceita como a pessoa, tira a marca e encerra", async () => {
    const { calls, deps } = changeWorld();
    await changeTemporaryPasswordFlow(input, deps);
    assert.deepEqual(calls, [
      "signIn:pessoa@empresa.com:K7mP4xR9tQ",
      "linked:auth-1:user-1",
      "status:tok-1",
      "setPassword:auth-1:MinhaSenha2026",
      "accept:at-K7mP4xR9tQ:tok-1",
      "clear:auth-1:false:email",
      "signOut:at-K7mP4xR9tQ",
    ]);
  });

  test("senha nova igual à provisória: recusada antes de qualquer chamada", async () => {
    const { calls, deps } = changeWorld();
    await assert.rejects(changeTemporaryPasswordFlow({ ...input, newPassword: input.temporaryPassword }, deps), (e) => e instanceof TemporaryPasswordError && e.code === "SAME_PASSWORD");
    assert.deepEqual(calls, []);
  });

  test("provisória errada: erro de credencial, nada trocado", async () => {
    const { calls, deps } = changeWorld({
      signIn: async () => {
        throw new Error("Invalid login credentials");
      },
    });
    await assert.rejects(changeTemporaryPasswordFlow(input, deps), (e) => e instanceof TemporaryPasswordError && e.code === "INVALID_CREDENTIALS");
    assert.deepEqual(calls, []);
  });

  test("convite revogado ou vencido: não troca, encerra a sessão provisória", async () => {
    for (const over of [{ invitationStatus: async () => "revoked" }, { now: () => new Date("2026-10-30T00:00:00Z") }] as Partial<ChangeDeps>[]) {
      const { calls, deps } = changeWorld(over);
      await assert.rejects(changeTemporaryPasswordFlow(input, deps), (e) => e instanceof TemporaryPasswordError && e.code === "EXPIRED");
      assert.ok(!calls.some((c) => c.startsWith("setPassword") || c.startsWith("accept")));
      assert.equal(calls.at(-1), "signOut:at-K7mP4xR9tQ");
    }
  });

  test("conta sem provisória: não usa esta rota para trocar senha", async () => {
    const { calls, deps } = changeWorld({ signIn: async () => ({ accessToken: "at", login: { id: "auth-1", appMetadata: { provider: "email" }, lastSignInAt: "x" } }) });
    await assert.rejects(changeTemporaryPasswordFlow(input, deps), (e) => e instanceof TemporaryPasswordError && e.code === "NOT_PENDING");
    assert.ok(!calls.some((c) => c.startsWith("setPassword")));
  });

  test("banco recusa o aceite (cadastro desativado no meio): a marca fica, nenhum acesso é liberado", async () => {
    const { calls, deps } = changeWorld({
      accept: async () => {
        throw new Error("O acesso deste cadastro está desativado.");
      },
    });
    await assert.rejects(changeTemporaryPasswordFlow(input, deps), /desativado/);
    assert.ok(!calls.some((c) => c.startsWith("clear")));
    assert.equal(calls.at(-1), "signOut:at-K7mP4xR9tQ");
  });

  test("retomada: cadastro já ligado a este login (troca interrompida) — só conclui", async () => {
    const { calls, deps } = changeWorld({ linkedTo: async () => true });
    await changeTemporaryPasswordFlow(input, deps);
    assert.ok(!calls.some((c) => c.startsWith("status") || c.startsWith("accept")));
    assert.ok(calls.includes("clear:auth-1:false:email"));
  });

  test("marca e bloqueio no login", () => {
    assert.equal(readTemporaryMeta({}), null);
    assert.equal(readTemporaryMeta({ [TEMPORARY_PASSWORD_META]: null }), null);
    assert.deepEqual(readTemporaryMeta(withMeta()), META);
    assert.equal(temporaryPasswordBlock(withMeta(), new Date("2026-10-17T00:00:00Z")), "change_required");
    assert.equal(temporaryPasswordBlock(withMeta(), new Date("2026-10-30T00:00:00Z")), "expired");
    assert.equal(temporaryPasswordBlock({ provider: "email" }), null);
  });
});
