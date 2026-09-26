#!/usr/bin/env node
// Senha da conta de serviço do EDUCA num projeto Neon Auth (AUTH_PROVIDER=neon).
//
// A senha é gerada NESTA máquina e gravada só no arquivo indicado (padrão
// ./.neon-service.env, permissão 600, fora do git). O script imprime o SQL com
// o HASH (nunca a senha) para colar no SQL Editor do projeto Neon (banco
// neondb). Formato idêntico ao do Better Auth 1.4 do Neon Auth: scrypt
// N=16384 r=16 p=1, 64 bytes, "salt(hex):hash(hex)".
//
// Antes: crie o usuário da conta de serviço no Neon Console (Auth → Users) com
// o e-mail informado aqui. O SQL grava a senha (cria a credencial se faltar) e
// dá o papel admin (criar usuário, confirmar e-mail, revogar sessões).
//
// Uso: node scripts/neon-service-account.mjs --email svc@seu-dominio.com [--out ./.neon-service.env]
import crypto from "node:crypto";
import fs from "node:fs";

const EMAIL_RE = /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const key = crypto.scryptSync(password.normalize("NFKC"), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString("hex")}`;
}

/** SQL idempotente: grava o hash na credencial (ou a cria) e promove a admin. */
export function serviceAccountSql(email, hash) {
  const e = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new Error("E-mail inválido.");
  if (!/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash)) throw new Error("Hash inválido.");
  return [
    `with u as (select id from neon_auth."user" where lower(email) = '${e}'),`,
    `upd as (update neon_auth.account a set password = '${hash}', "updatedAt" = now() from u where a."userId" = u.id and a."providerId" = 'credential' returning a.id)`,
    `insert into neon_auth.account ("accountId", "providerId", "userId", password, "updatedAt")`,
    `select u.id::text, 'credential', u.id, '${hash}', now() from u`,
    `where not exists (select 1 from upd) and not exists (select 1 from neon_auth.account a where a."userId" = u.id and a."providerId" = 'credential');`,
    `update neon_auth."user" set role = 'admin', "emailVerified" = true, "updatedAt" = now() where lower(email) = '${e}';`,
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = get("--email");
  const out = get("--out") ?? ".neon-service.env";
  if (!email) throw new Error("Informe --email (e-mail da conta de serviço no Neon Auth).");
  if (fs.existsSync(out)) throw new Error(`${out} já existe. Apague-o só se quiser gerar outra senha (e rode o SQL de novo).`);
  const password = crypto.randomBytes(32).toString("base64url");
  const sql = serviceAccountSql(email, hashPassword(password));
  fs.writeFileSync(out, `NEON_AUTH_SERVICE_EMAIL=${email.trim().toLowerCase()}\nNEON_AUTH_SERVICE_PASSWORD=${password}\n`, { mode: 0o600 });
  console.log(`Senha gerada e gravada só em ${out} (não compartilhe; copie os 2 valores para as variáveis de ambiente do servidor).`);
  console.log("\nCole e execute no Neon Console → projeto de PRODUÇÃO → SQL Editor (banco neondb):\n");
  console.log(sql);
  console.log("\nResultado esperado: INSERT 0 1 (ou 0, se a credencial já existia) e UPDATE 1.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`Erro: ${error.message}`);
    process.exit(1);
  }
}
