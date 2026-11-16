#!/usr/bin/env node
// Gera o par ES256 (P-256) do SSO ATLAS → ORION (§2.8).
// Uso: node scripts/orion-sso-keygen.mjs atlas-sso-2026-11
// Imprime ATLAS_SSO_PRIVATE_JWK (segredo, só no ATLAS) e a chave pública.
import { exportJWK, generateKeyPair } from "jose";

const kid = process.argv[2] ?? `atlas-sso-${new Date().toISOString().slice(0, 7)}`;
const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const priv = { ...(await exportJWK(privateKey)), kid, alg: "ES256", use: "sig" };
const pub = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
console.log(`ATLAS_SSO_PRIVATE_JWK='${JSON.stringify(priv)}'`);
console.log(`# pública (vai para ATLAS_SSO_PREVIOUS_PUBLIC_JWKS na próxima rotação):`);
console.log(JSON.stringify({ keys: [pub] }));
