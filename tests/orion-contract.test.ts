// Testes de contrato do lado ATLAS (docs/INTEGRACAO-ATLAS-ORION.md §7.4):
// índice SHA-256 das fixtures, todas as fixtures contra os schemas Zod,
// claims/JWKS do SSO, respostas e assinatura HMAC com vetor fixo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  accessCheckResponseSchema,
  atlasToOrionPayloads,
  capabilities,
  envelopeSchema,
  eventResponseSchema,
  jwksSchema,
  launchTokenClaimsSchema,
  launchTokenHeaderSchema,
  orionToAtlasPayloads,
  parseInboundEnvelope,
} from "@/lib/validations/orion";
import { canonicalString, signRequest, verifySignature } from "@/lib/integrations/orion/signature";

const DIR = path.join(process.cwd(), "docs/contrato");
const read = (f: string) => readFileSync(path.join(DIR, f));
const json = (f: string) => JSON.parse(read(f).toString("utf8"));

describe("fixtures do contrato", () => {
  const index = json("index.json") as { contract: string; version: number; files: Array<{ file: string; type?: string; sha256: string }> };
  const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json").sort();

  test("index.json lista exatamente as fixtures e o SHA-256 de cada uma confere", () => {
    assert.equal(index.contract, "astraeus.atlas-orion");
    assert.equal(index.version, 1);
    assert.deepEqual(index.files.map((f) => f.file).sort(), onDisk);
    for (const f of index.files) {
      assert.equal(createHash("sha256").update(read(f.file)).digest("hex"), f.sha256, f.file);
    }
  });

  test("todo a2o.* passa no envelope e no schema do payload do tipo", () => {
    const files = onDisk.filter((f) => f.startsWith("a2o."));
    assert.equal(files.length, Object.keys(atlasToOrionPayloads).length, "um schema por tipo a2o");
    for (const f of files) {
      const env = envelopeSchema.parse(json(f));
      assert.equal(env.source, "atlas", f);
      assert.equal(`a2o.${env.type}.json`, f);
      const schema = atlasToOrionPayloads[env.type as keyof typeof atlasToOrionPayloads];
      assert.ok(schema, `schema de ${env.type}`);
      const r = schema.safeParse(env.payload);
      assert.ok(r.success, `${f}: ${r.success ? "" : JSON.stringify(r.error.issues)}`);
    }
  });

  test("todo o2a.* passa na validação de entrada do ATLAS", () => {
    const files = onDisk.filter((f) => f.startsWith("o2a."));
    for (const f of files) {
      const r = parseInboundEnvelope(json(f));
      assert.ok(r.ok, `${f}: ${r.ok ? "" : r.message}`);
      assert.equal(`o2a.${r.ok && r.envelope.type}.json`, f);
    }
    // todos os tipos o2a das fixtures são anunciados em /capabilities
    const caps = capabilities().types;
    for (const f of files) assert.deepEqual(caps[f.slice(4, -5)], [1], f);
  });

  test("entrada recusa envelope inválido, tipo desconhecido e payload incompleto", () => {
    assert.equal((parseInboundEnvelope({}) as { code: string }).code, "invalid_envelope");
    const unknown = { ...json("o2a.outbound.accepted.json"), type: "outbound.teleported" };
    assert.equal((parseInboundEnvelope(unknown) as { code: string }).code, "validation_failed");
    const bad = json("o2a.outbound.shipped.json");
    delete bad.payload.lines[0].atlas_line_id;
    const r = parseInboundEnvelope(bad);
    assert.equal(r.ok, false);
    assert.match((r as { message: string }).message, /payload\.lines\[0\]\.atlas_line_id/);
    const fromAtlas = { ...json("o2a.outbound.accepted.json"), source: "atlas" };
    assert.equal(parseInboundEnvelope(fromAtlas).ok, false);
  });

  test("respostas resposta.* e checagem de acesso s2s.*", () => {
    for (const f of onDisk.filter((x) => x.startsWith("resposta."))) {
      assert.ok(eventResponseSchema.safeParse(json(f)).success, f);
    }
    assert.ok(accessCheckResponseSchema.safeParse(json("s2s.access-check.response.ativo.json")).success);
    assert.ok(accessCheckResponseSchema.safeParse(json("s2s.access-check.response.revogado.json")).success);
    const req = json("s2s.access-check.request.json");
    assert.equal(req.method, "GET");
    assert.ok(req.path.startsWith("/api/integrations/orion/v1/access?atlas_user_id="));
    assert.deepEqual(Object.keys(req.headers).sort(), ["X-Astraeus-Key-Id", "X-Astraeus-Signature", "X-Astraeus-Timestamp"]);
  });

  test("SSO: claims, cabeçalho e JWKS das fixtures", () => {
    const claims = launchTokenClaimsSchema.parse(json("sso.launch-token.claims.json"));
    assert.equal(claims.exp - claims.iat, 60);
    assert.ok(launchTokenHeaderSchema.safeParse(json("sso.launch-token.header.json")).success);
    const jwks = jwksSchema.parse(json("sso.jwks.json"));
    assert.equal(jwks.keys[0].kid, json("sso.launch-token.header.json").kid);
    assert.equal(launchTokenClaimsSchema.safeParse({ ...claims, return_to: "//evil.com" }).success, false);
    assert.equal(launchTokenClaimsSchema.safeParse({ ...claims, exp: claims.iat + 600 }).success, false);
  });
});

describe("assinatura HMAC (§3.2)", () => {
  // Vetor fixo: HMAC_SHA256("segredo-de-teste", "1763211600.GET./api/integrations/orion/v1/access?atlas_user_id=0a7a5000-0000-4000-8000-000000000101.")
  const path = "/api/integrations/orion/v1/access?atlas_user_id=0a7a5000-0000-4000-8000-000000000101";

  test("string canônica e vetor fixo", () => {
    assert.equal(canonicalString(1763211600, "get", path, ""), `1763211600.GET.${path}.`);
    // valor calculado fora do código (openssl dgst -sha256 -hmac)
    assert.equal(signRequest("segredo-de-teste", "1763211600", "GET", path, ""), VECTOR);
  });

  test("verificação: janela de 300 s, segredo anterior na rotação e adulteração", () => {
    const now = 1763211600 * 1000;
    const sig = signRequest("novo", "1763211600", "POST", "/x", "{}");
    assert.deepEqual(verifySignature({ secrets: ["novo"], timestamp: "1763211600", signature: sig, method: "POST", pathWithQuery: "/x", body: "{}", now }), { ok: true });
    assert.deepEqual(verifySignature({ secrets: ["outro", "novo"], timestamp: "1763211600", signature: sig, method: "POST", pathWithQuery: "/x", body: "{}", now }), { ok: true });
    assert.deepEqual(verifySignature({ secrets: ["novo"], timestamp: "1763211600", signature: sig, method: "POST", pathWithQuery: "/x", body: "{ }", now }), { ok: false, code: "invalid_signature" });
    assert.deepEqual(verifySignature({ secrets: ["novo"], timestamp: "1763211600", signature: sig, method: "POST", pathWithQuery: "/y", body: "{}", now }), { ok: false, code: "invalid_signature" });
    assert.deepEqual(verifySignature({ secrets: ["novo"], timestamp: "1763211600", signature: sig, method: "POST", pathWithQuery: "/x", body: "{}", now: now + 301_000 }), { ok: false, code: "stale_timestamp" });
    assert.deepEqual(verifySignature({ secrets: ["novo"], timestamp: null, signature: sig, method: "POST", pathWithQuery: "/x", body: "{}", now }), { ok: false, code: "missing_headers" });
  });
});

const VECTOR = "sha256=af48b6dbd8102ed2eec1abc9b9fc5b58a3039e167b2068e82a4e505ca8459827";
