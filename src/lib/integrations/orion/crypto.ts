import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Segredos HMAC por empresa cifrados em repouso com AES-256-GCM (§3.2).
// Chave: INTEGRATION_ENCRYPTION_KEY — 32 bytes em base64, base64url ou hex
// (gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
// Formato guardado: base64(iv[12] ‖ tag[16] ‖ cifrado).

export function parseEncryptionKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("Defina INTEGRATION_ENCRYPTION_KEY (32 bytes em base64 ou hex).");
  const value = raw.trim();
  const buf = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (buf.length !== 32) throw new Error("INTEGRATION_ENCRYPTION_KEY deve ter exatamente 32 bytes.");
  return buf;
}

export function encryptSecret(plain: string, key: Buffer = parseEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY)): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(b64: string, key: Buffer = parseEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY)): string {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 29) throw new Error("Segredo cifrado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Segredo HMAC novo: 32 bytes aleatórios em base64url. */
export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** key_id da empresa (ex.: atlas-co-0a7a5000-3f9c). */
export function generateKeyId(companyId: string): string {
  return `atlas-co-${companyId.replace(/-/g, "").slice(0, 8)}-${randomBytes(2).toString("hex")}`;
}
