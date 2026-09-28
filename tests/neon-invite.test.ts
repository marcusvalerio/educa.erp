// Convite de plataforma com AUTH_PROVIDER=neon: provisionamento da identidade
// (provisionIdentity) → entrega (deliveryFromProvision) → login do convidado
// (resolveInvitedLogin), exatamente a cadeia da rota /api/platform/members/invite.
//
// Regressão coberta: com a conta JÁ EXISTENTE E CONFIRMADA no Neon, o
// provisionamento devolvia o login-sombra, mas a entrega o descartava; sem
// login achado antes (1º convite), a rota respondia 503 e só a 2ª tentativa
// passava. As dependências são um dublê COM ESTADO (identidades, logins e
// vínculos), para provar também idempotência e ausência de duplicatas.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deliveryFromProvision, provisionIdentity, type ProvisionDeps } from "@/lib/auth/neon/flows";
import { resolveInvitedLogin, type Delivery } from "@/lib/onboarding/invitations";

type World = {
  neon: Map<string, { id: string; email: string; emailVerified: boolean; name: string; banned: boolean }>;
  shadow: Map<string, string>; // e-mail → auth_user_id
  links: Map<string, string>; // neon id → auth_user_id
  firstAccess: string[];
  creates: number;
};
const world = (): World => ({ neon: new Map(), shadow: new Map(), links: new Map(), firstAccess: [], creates: 0 });
let seq = 0;
const deps = (w: World): ProvisionDeps => ({
  ensureShadowLogin: async (email) => {
    if (!w.shadow.has(email)) w.shadow.set(email, `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`);
    return w.shadow.get(email)!;
  },
  findNeonUser: async (email) => w.neon.get(email) ?? null,
  createNeonUser: async (email, name) => {
    w.creates++;
    const u = { id: `neon-${++seq}`, email, emailVerified: false, name, banned: false };
    w.neon.set(email, u);
    return u;
  },
  link: async (neonId, _email, authUserId) => {
    const prev = w.links.get(neonId);
    // Mesma regra do fn_link_identity (0073): nunca religa a outro login.
    if (prev && prev !== authUserId) throw new Error("vínculo com outro login");
    w.links.set(neonId, authUserId);
  },
  sendFirstAccess: async (email) => void w.firstAccess.push(email),
});

// A cadeia da rota: login achado ANTES (fn_platform_auth_user_id) + convite.
async function invite(w: World, email: string) {
  const found = w.shadow.get(email) ?? null;
  const delivery: Delivery = deliveryFromProvision(await provisionIdentity({ email, name: "Convidado" }, deps(w)));
  return { delivery, invited: resolveInvitedLogin(found, delivery) };
}

describe("convite de plataforma com Neon Auth", () => {
  test("identidade inexistente: cria identidade e login, envia o 1º acesso, devolve o login", async () => {
    const w = world();
    const { delivery, invited } = await invite(w, "nova@example.com");
    assert.equal(delivery.delivered, true);
    assert.ok(invited);
    assert.equal(invited.emailSent, true);
    assert.equal(invited.authUserId, w.shadow.get("nova@example.com"));
    assert.equal(w.creates, 1);
    assert.deepEqual(w.firstAccess, ["nova@example.com"]);
  });

  test("identidade existente sem senha (não confirmada): reaproveita, não duplica, reenvia o 1º acesso", async () => {
    const w = world();
    w.neon.set("pendente@example.com", { id: "neon-x", email: "pendente@example.com", emailVerified: false, name: "P", banned: false });
    const { invited } = await invite(w, "pendente@example.com");
    assert.ok(invited);
    assert.equal(invited.emailSent, true);
    assert.equal(w.creates, 0, "não cria outra identidade");
    assert.equal(w.links.get("neon-x"), invited.authUserId);
  });

  test("identidade existente e CONFIRMADA, 1º convite (sem login antes): funciona e devolve o login", async () => {
    const w = world();
    w.neon.set("owner@example.com", { id: "neon-o", email: "owner@example.com", emailVerified: true, name: "O", banned: false });
    assert.equal(w.shadow.get("owner@example.com"), undefined, "cenário do bug: nenhum login antes do convite");
    const { delivery, invited } = await invite(w, "owner@example.com");
    assert.deepEqual(delivery, { delivered: false, reason: "existing_account", authUserId: w.shadow.get("owner@example.com") });
    assert.ok(invited, "antes da correção: null → 503");
    assert.equal(invited.emailSent, false, "quem já tem senha não recebe novo link");
    assert.equal(invited.authUserId, w.shadow.get("owner@example.com"));
    assert.equal(w.links.get("neon-o"), invited.authUserId);
    assert.deepEqual(w.firstAccess, []);
    assert.equal(w.creates, 0);
  });

  test("convite repetido: mesmo login, mesma identidade, sem duplicar e sem religar", async () => {
    const w = world();
    const first = await invite(w, "repetido@example.com");
    const second = await invite(w, "repetido@example.com");
    // Conta confirmada depois (a pessoa criou a senha) e 3º convite:
    w.neon.get("repetido@example.com")!.emailVerified = true;
    const third = await invite(w, "repetido@example.com");
    const ids = [first, second, third].map((r) => r.invited?.authUserId);
    assert.ok(ids.every((id) => id && id === ids[0]), "sempre o mesmo login");
    assert.equal(w.creates, 1, "uma identidade só");
    assert.equal(w.shadow.size, 1, "um login só");
    assert.equal(w.links.size, 1);
    assert.equal(third.invited?.emailSent, false);
  });
});

describe("resolveInvitedLogin (regras da rota)", () => {
  const ID = "00000000-0000-4000-8000-00000000abcd";
  test("entregue com login → e-mail enviado", () => {
    assert.deepEqual(resolveInvitedLogin(null, { delivered: true, authUserId: ID }), { authUserId: ID, emailSent: true });
  });
  test("entregue sem login → não conclui", () => {
    assert.equal(resolveInvitedLogin(ID, { delivered: true, authUserId: null }), null);
  });
  test("conta existente: login do provisionamento; sem ele, o achado antes (Supabase)", () => {
    assert.deepEqual(resolveInvitedLogin(null, { delivered: false, reason: "existing_account", authUserId: ID }), { authUserId: ID, emailSent: false });
    assert.deepEqual(resolveInvitedLogin(ID, { delivered: false, reason: "existing_account" }), { authUserId: ID, emailSent: false });
    assert.equal(resolveInvitedLogin(null, { delivered: false, reason: "existing_account" }), null);
  });
  test("falha de e-mail → não conclui, mesmo com login", () => {
    assert.equal(resolveInvitedLogin(ID, { delivered: false, reason: "email_unavailable", authUserId: ID }), null);
  });
});
