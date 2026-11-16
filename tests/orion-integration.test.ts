// Integração ATLAS ↔ ORION ponta a ponta, com o ORION simulado por um
// servidor HTTP local: SSO (assinatura ES256, claims, expiração, só quem tem
// acesso), segredo cifrado, processador da outbox (HMAC, ordem, backoff,
// recusas) e as rotas de entrada (HMAC, janela de 300 s, idempotência,
// empresa errada) sobre o banco completo em PGlite.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, generateKeyPair, jwtVerify } from "jose";
import { createAtlasDb, ownerQuery, pgliteDataClient, seedCompany, type SeededCompany } from "./helpers/atlas-pglite";
import { buildJwks, buildLaunchClaims, launchPage, safeReturnTo, signLaunchToken, validState, type AccessGrant } from "@/lib/integrations/orion/sso";
import { decryptSecret, encryptSecret, generateKeyId, generateSecret, parseEncryptionKey } from "@/lib/integrations/orion/crypto";
import { signedHeaders, verifySignature } from "@/lib/integrations/orion/signature";
import { processOutbox, classify } from "@/lib/integrations/orion/outbox";
import { linkCompany } from "@/lib/integrations/orion/client";
import { handleAccessCheck, handleInboundEvent } from "@/lib/integrations/orion/inbound";
import { launchTokenClaimsSchema, accessCheckResponseSchema, envelopeSchema, atlasToOrionPayloads } from "@/lib/validations/orion";
import type { OrionDb } from "@/lib/integrations/orion/types";

const KEY = parseEncryptionKey(Buffer.alloc(32, 7).toString("base64"));
const decrypt = (b64: string) => decryptSecret(b64, KEY);
const fx = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "docs/contrato", f), "utf8"));

describe("SSO (launch token ES256)", () => {
  let privateJwk: string;
  let previous: string;
  const grant: AccessGrant = {
    atlas_user_id: "0a7a5000-0000-4000-8000-000000000101", atlas_company_id: "0a7a5000-0000-4000-8000-000000000001",
    orion_company_id: "0410e000-0000-4000-8000-000000000001", email: "maria.souza@alfa.com.br", name: "Maria Souza",
    orion_role: "supervisor", access_version: 3, warehouses: ["DEP-01"],
  };
  before(async () => {
    const cur = await generateKeyPair("ES256", { extractable: true });
    privateJwk = JSON.stringify({ ...(await exportJWK(cur.privateKey)), kid: "atlas-sso-2026-11" });
    const old = await generateKeyPair("ES256", { extractable: true });
    previous = JSON.stringify({ keys: [{ ...(await exportJWK(old.publicKey)), kid: "atlas-sso-2026-10" }] });
  });

  test("assina com kid, valida no JWKS publicado e as claims seguem o contrato", async () => {
    const jwks = buildJwks({ privateJwk, previousJwks: previous });
    assert.deepEqual(jwks.keys.map((k) => k.kid), ["atlas-sso-2026-11", "atlas-sso-2026-10"]);
    assert.ok(jwks.keys.every((k) => !("d" in k)), "JWKS nunca publica a parte privada");
    const claims = buildLaunchClaims({ issuer: "https://atlas.exemplo.com.br", grant, returnTo: "/separacao", state: "q8Zr0pV1xS2t" });
    const token = await signLaunchToken(claims, privateJwk);
    assert.deepEqual(decodeProtectedHeader(token), { alg: "ES256", typ: "JWT", kid: "atlas-sso-2026-11" });
    // Verificação como o ORION faz (§2.4)
    const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer: "https://atlas.exemplo.com.br", audience: "orion-wms", algorithms: ["ES256"], clockTolerance: 30, maxTokenAge: "120s",
    });
    const parsed = launchTokenClaimsSchema.parse(payload);
    assert.deepEqual(Object.keys(parsed).sort(), Object.keys(fx("sso.launch-token.claims.json")).sort());
    assert.equal(parsed.exp - parsed.iat, 60);
  });

  test("token expirado e chave fora do JWKS são recusados", async () => {
    const old = buildLaunchClaims({ issuer: "https://a", grant, returnTo: "/", now: Date.now() - 10 * 60_000 });
    const token = await signLaunchToken(old, privateJwk);
    await assert.rejects(jwtVerify(token, createLocalJWKSet(buildJwks({ privateJwk })), { audience: "orion-wms", algorithms: ["ES256"], clockTolerance: 30 }), /exp/);
    const other = await generateKeyPair("ES256", { extractable: true });
    const foreign = await signLaunchToken(buildLaunchClaims({ issuer: "https://a", grant, returnTo: "/" }), JSON.stringify({ ...(await exportJWK(other.privateKey)), kid: "atlas-sso-2026-11" }));
    await assert.rejects(jwtVerify(foreign, createLocalJWKSet(buildJwks({ privateJwk })), { audience: "orion-wms" }));
  });

  test("return_to e state saneados; página auto-submetida sem token na URL e com CSP", async () => {
    assert.equal(safeReturnTo("//evil.com"), "/");
    assert.equal(safeReturnTo("https://evil.com"), "/");
    assert.equal(safeReturnTo("/a\\b"), "/");
    assert.equal(safeReturnTo("/separacao?x=1"), "/separacao?x=1");
    assert.equal(validState("abc"), null);
    assert.equal(validState("q8Zr0pV1xS2t"), "q8Zr0pV1xS2t");
    const page = launchPage("https://orion.exemplo/", "TOKEN.X.Y");
    assert.match(page.html, /<form id="f" method="post" action="https:\/\/orion\.exemplo\/api\/sso\/atlas">/);
    assert.match(page.html, /name="token" value="TOKEN\.X\.Y"/);
    assert.equal(page.headers["Cache-Control"], "no-store");
    assert.match(page.headers["Content-Security-Policy"], /form-action https:\/\/orion\.exemplo/);
  });
});

describe("segredo por empresa (AES-256-GCM)", () => {
  test("cifra/decifra, IV aleatório e adulteração detectada", () => {
    const s = generateSecret();
    const a = encryptSecret(s, KEY);
    assert.notEqual(a, encryptSecret(s, KEY));
    assert.equal(decrypt(a), s);
    const tampered = Buffer.from(a, "base64");
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decrypt(tampered.toString("base64")));
    assert.throws(() => parseEncryptionKey("curta"));
    assert.match(generateKeyId("0a7a5000-0000-4000-8000-000000000001"), /^atlas-co-0a7a5000-[0-9a-f]{4}$/);
  });
});

describe("ATLAS ↔ ORION simulado", () => {
  let db: PGlite;
  let A: SeededCompany;
  let B: SeededCompany;
  let svc: OrionDb;
  let server: Server;
  let orionUrl = "";
  const secretA = generateSecret();
  const secretB = generateSecret();
  const keyA = "atlas-co-a";
  const keyB = "atlas-co-b";
  const ORION_A = "0410e000-0000-4000-8000-0000000000a1";
  const received: Array<{ env: Record<string, unknown>; ok: boolean }> = [];
  let mode: "ok" | "fail_once_503" | "reject_validation" = "ok";
  let failedOnce = false;

  before(async () => {
    db = await createAtlasDb();
    A = await seedCompany(db, "Alfa");
    B = await seedCompany(db, "Beta");
    svc = pgliteDataClient(db, { role: "service_role" }) as unknown as OrionDb;
    // ORION simulado: /links (credencial de instalação) e /events (segredo da empresa)
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const url = req.url ?? "";
        const h = (n: string) => (req.headers[n] as string | undefined) ?? null;
        const send = (status: number, obj: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
        if (url === "/api/atlas/v1/links") {
          const ok = verifySignature({ secrets: ["instalacao"], timestamp: h("x-astraeus-timestamp"), signature: h("x-astraeus-signature"), method: "POST", pathWithQuery: url, body });
          if (!ok.ok || h("x-astraeus-key-id") !== "install-1") return send(401, { error: { code: "invalid_signature" } });
          return send(201, { orion_company_id: ORION_A });
        }
        const secret = h("x-astraeus-key-id") === keyA ? secretA : h("x-astraeus-key-id") === keyB ? secretB : null;
        const ok = verifySignature({ secrets: [secret], timestamp: h("x-astraeus-timestamp"), signature: h("x-astraeus-signature"), method: "POST", pathWithQuery: url, body });
        if (!ok.ok) return send(401, { status: "rejected", event_id: null, error: { code: ok.code, message: "x", retryable: false } });
        const env = JSON.parse(body);
        assert.equal(h("idempotency-key"), env.id);
        if (mode === "fail_once_503" && !failedOnce) { failedOnce = true; return send(503, {}); }
        if (mode === "reject_validation" && env.type === "sales_order.released") {
          received.push({ env, ok: false });
          return send(400, { status: "rejected", event_id: env.id, error: { code: "validation_failed", message: "produto não sincronizado", retryable: false } });
        }
        received.push({ env, ok: true });
        send(202, { status: "accepted", event_id: env.id, duplicate: false });
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    orionUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  test("vínculo: POST /links com a credencial de instalação e segredo cifrado no banco", async () => {
    const { orionCompanyId } = await linkCompany({
      orionUrl, installKeyId: "install-1", installSecret: "instalacao",
      request: { atlas_company_id: A.companyId, atlas_url: "https://atlas", key_id: keyA, secret: secretA, company: {}, admin: null },
    });
    assert.equal(orionCompanyId, ORION_A);
    await assert.rejects(linkCompany({ orionUrl, installKeyId: "install-1", installSecret: "errado", request: { atlas_company_id: A.companyId, atlas_url: "x", key_id: keyA, secret: secretA, company: {}, admin: null } }), /recusou/);
    for (const [c, key, secret, orion] of [[A, keyA, secretA, ORION_A], [B, keyB, secretB, "0410e000-0000-4000-8000-0000000000b1"]] as const) {
      await ownerQuery(db, "update company_modules set contracted = true, enabled_by_company = true where company_id = $1 and module_code = 'orion'", [c.companyId]);
      const r = await svc.rpc("fn_orion_link_company", { p_company_id: c.companyId, p_orion_url: orionUrl, p_key_id: key, p_secret_ciphertext_b64: encryptSecret(secret, KEY), p_orion_company_id: orion, p_by: null });
      assert.equal(r.error, null, r.error?.message);
    }
    const [row] = await ownerQuery<{ s: string }>(db, "select encode(secret_ciphertext, 'escape') s from orion_integrations where company_id = $1", [A.companyId]);
    assert.ok(!row.s.includes(secretA), "segredo nunca em claro no banco");
  });

  test("processador: envelopes assinados, válidos no contrato, em ordem por agregado", async () => {
    const stats = await processOutbox({ db: svc, decrypt, fetchImpl: undefined });
    assert.ok(stats.sent > 0);
    assert.equal(stats.failed, 0);
    for (const { env } of received) {
      const e = envelopeSchema.parse(env);
      const schema = atlasToOrionPayloads[e.type as keyof typeof atlasToOrionPayloads];
      assert.ok(schema.safeParse(e.payload).success, `${e.type}: ${JSON.stringify(schema.safeParse(e.payload).error?.issues)}`);
    }
    const seqs = new Map<string, number>();
    for (const { env } of received) {
      const agg = env.aggregate as { type: string; id: string; sequence: number };
      const k = `${env.atlas_company_id}:${agg.type}:${agg.id}`;
      assert.ok(agg.sequence > (seqs.get(k) ?? 0), `ordem em ${k}`);
      seqs.set(k, agg.sequence);
    }
    const left = await ownerQuery(db, "select 1 from integration_outbox where status <> 'sent'");
    assert.equal(left.length, 0);
  });

  test("falha 503 ⇒ backoff e nova tentativa; recusa de validação ⇒ failed e erro no pedido", async () => {
    await ownerQuery(db, "update orion_integrations set status = 'active' where company_id = $1", [A.companyId]);
    const p = await ownerQuery<{ id: string }>(db, "insert into products (company_id, code, name, unit, unit_id) values ($1, 'X-1', 'Produto X', 'UN', $2) returning id", [A.companyId, A.unitId]);
    mode = "fail_once_503";
    const s1 = await processOutbox({ db: svc, decrypt });
    assert.equal(s1.retried, 1);
    const [ev] = await ownerQuery<{ attempts: number; next: boolean }>(db, "select attempts, next_attempt_at > now() as next from integration_outbox where aggregate_id = $1", [p[0].id]);
    assert.deepEqual([ev.attempts, ev.next], [1, true]);
    await ownerQuery(db, "update integration_outbox set next_attempt_at = now() where aggregate_id = $1", [p[0].id]);
    assert.equal((await processOutbox({ db: svc, decrypt })).sent, 1);

    mode = "reject_validation";
    const cust = await ownerQuery<{ id: string }>(db, "insert into customers (company_id, code, name, document) values ($1, 'C-1', 'Cliente', '11444777000161') returning id", [A.companyId]);
    const so = await ownerQuery<{ id: string }>(db, "insert into sales_orders (company_id, code, customer_id, status) values ($1, 'PV-T', $2, 'pending_approval') returning id", [A.companyId, cust[0].id]);
    await ownerQuery(db, "insert into sales_order_items (company_id, order_id, product_id, description, unit, ordered_quantity, unit_price) values ($1, $2, $3, 'X', 'UN', 2, 1)", [A.companyId, so[0].id, p[0].id]);
    await ownerQuery(db, "update sales_orders set status = 'approved' where id = $1", [so[0].id]);
    const s2 = await processOutbox({ db: svc, decrypt });
    assert.equal(s2.failed, 1);
    const [order] = await ownerQuery<{ wms_status: string; wms_last_error: string }>(db, "select wms_status, wms_last_error from sales_orders where id = $1", [so[0].id]);
    assert.equal(order.wms_status, "failed");
    assert.match(order.wms_last_error, /validation_failed/);
    mode = "ok";
  });

  test("classificação das respostas do ORION (§3.4)", () => {
    assert.deepEqual(classify(202, { status: "accepted" }), { ok: true, retryable: false, error: null });
    assert.equal(classify(200, { status: "accepted", duplicate: true }).ok, true);
    assert.equal(classify(409, { status: "rejected", error: { code: "out_of_order", retryable: true } }).retryable, true);
    assert.equal(classify(422, { status: "rejected", error: { code: "dependency_missing", retryable: true } }).retryable, true);
    assert.equal(classify(409, { status: "rejected", error: { code: "document_in_progress", retryable: false } }).retryable, false);
    assert.equal(classify(401, { status: "rejected", error: { code: "invalid_signature" } }).retryable, false);
    assert.equal(classify(429, null).retryable, true);
    assert.equal(classify(500, null).retryable, true);
  });

  const headersOf = (h: Record<string, string>) => ({ get: (n: string) => Object.entries(h).find(([k]) => k.toLowerCase() === n.toLowerCase())?.[1] ?? null });
  const PATH = "/api/integrations/orion/v1/events";
  const event = (companyId: string, orion: string, over: Record<string, unknown> = {}) => ({
    ...fx("o2a.document.rejected.json"),
    atlas_company_id: companyId,
    orion_company_id: orion,
    ...over,
  });

  test("rota de entrada: HMAC da empresa, janela de 300 s, idempotência e empresa errada", async () => {
    const so = await ownerQuery<{ id: string }>(db, "select id from sales_orders where company_id = $1 limit 1", [A.companyId]);
    const env = event(A.companyId, ORION_A);
    (env.payload as Record<string, unknown>).atlas_document_id = so[0].id;
    const body = JSON.stringify(env);
    const h = signedHeaders({ keyId: keyA, secret: secretA, method: "POST", pathWithQuery: PATH, body, idempotencyKey: env.id });
    const r1 = await handleInboundEvent({ db: svc, decrypt }, { method: "POST", pathWithQuery: PATH, headers: headersOf(h), body });
    assert.equal(r1.status, 202, JSON.stringify(r1.body));
    const r2 = await handleInboundEvent({ db: svc, decrypt }, { method: "POST", pathWithQuery: PATH, headers: headersOf(h), body });
    assert.deepEqual([r2.status, (r2.body as { duplicate: boolean }).duplicate], [200, true]);
    // assinatura de outro corpo
    const r3 = await handleInboundEvent({ db: svc, decrypt }, { method: "POST", pathWithQuery: PATH, headers: headersOf(h), body: body.replace("Produto", "Prodito") });
    assert.deepEqual([r3.status, (r3.body as { error: { code: string } }).error.code], [401, "invalid_signature"]);
    // relógio fora da janela
    const stale = signedHeaders({ keyId: keyA, secret: secretA, method: "POST", pathWithQuery: PATH, body, now: Date.now() - 400_000 });
    const r4 = await handleInboundEvent({ db: svc, decrypt }, { method: "POST", pathWithQuery: PATH, headers: headersOf(stale), body });
    assert.equal((r4.body as { error: { code: string } }).error.code, "stale_timestamp");
    // key_id desconhecido
    const unk = signedHeaders({ keyId: "nao-existe", secret: secretA, method: "POST", pathWithQuery: PATH, body });
    assert.equal((await handleInboundEvent({ db: svc, decrypt }, { method: "POST", pathWithQuery: PATH, headers: headersOf(unk), body })).status, 401);
    // segredo da empresa B com envelope da empresa A ⇒ 403 company_mismatch, nada aplicado
    const envA = event(A.companyId, ORION_A, { id: "0410e000-0000-4000-8000-000000909999" });
    const bodyA = JSON.stringify(envA);
    const hb = signedHeaders({ keyId: keyB, secret: secretB, method: "POST", pathWithQuery: PATH, body: bodyA });
    const r5 = await handleInboundEvent({ db: svc, decrypt }, { method: "POST", pathWithQuery: PATH, headers: headersOf(hb), body: bodyA });
    assert.deepEqual([r5.status, (r5.body as { error: { code: string } }).error.code], [403, "company_mismatch"]);
    assert.equal((await ownerQuery(db, "select 1 from integration_inbox where event_id = $1", [envA.id])).length, 0);
    // corpo inválido
    const bad = "{nao json";
    const hbad = signedHeaders({ keyId: keyA, secret: secretA, method: "POST", pathWithQuery: PATH, body: bad });
    assert.equal((await handleInboundEvent({ db: svc, decrypt }, { method: "POST", pathWithQuery: PATH, headers: headersOf(hbad), body: bad })).status, 400);
  });

  test("checagem de acesso assinada (GET /access) no formato do contrato", async () => {
    await ownerQuery(db, "insert into orion_user_access (company_id, user_id, orion_role, warehouses) values ($1, $2, 'supervisor', '{}')", [A.companyId, A.adminUserId]);
    const q = `/api/integrations/orion/v1/access?atlas_user_id=${A.adminUserId}`;
    const h = signedHeaders({ keyId: keyA, secret: secretA, method: "GET", pathWithQuery: q, body: "" });
    const r = await handleAccessCheck({ db: svc, decrypt }, { method: "GET", pathWithQuery: q, headers: headersOf(h), body: "" }, A.adminUserId);
    assert.equal(r.status, 200);
    const parsed = accessCheckResponseSchema.parse(r.body);
    assert.equal(parsed.active, true);
    assert.deepEqual(Object.keys(r.body as object).sort(), Object.keys(fx("s2s.access-check.response.ativo.json")).sort());
    // usuário de B consultado com a credencial de A ⇒ inativo (nunca vaza B)
    const qb = `/api/integrations/orion/v1/access?atlas_user_id=${B.adminUserId}`;
    const hb = signedHeaders({ keyId: keyA, secret: secretA, method: "GET", pathWithQuery: qb, body: "" });
    const rb = await handleAccessCheck({ db: svc, decrypt }, { method: "GET", pathWithQuery: qb, headers: headersOf(hb), body: "" }, B.adminUserId);
    assert.deepEqual([(rb.body as { active: boolean }).active, (rb.body as { reason: string }).reason], [false, "user_inactive"]);
    assert.deepEqual(Object.keys(rb.body as object).sort(), Object.keys(fx("s2s.access-check.response.revogado.json")).sort());
  });
});
