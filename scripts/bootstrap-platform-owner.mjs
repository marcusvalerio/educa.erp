#!/usr/bin/env node
// Bootstrap do PRIMEIRO Platform Owner do EDUCA.
//
//   node scripts/bootstrap-platform-owner.mjs --email pessoa@empresa.com --name "Nome Completo" \
//        --app-url https://erp.exemplo.com.br [--dry-run]
//
// Onde roda: SOMENTE numa máquina confiável de quem administra o projeto,
// com SUPABASE_SERVICE_ROLE_KEY no ambiente (nunca no navegador, nunca
// commitada). Não existe tela nem rota HTTP para isso — de propósito:
// ninguém se torna Owner por se cadastrar ou por informar um e-mail num
// formulário.
//
// O que faz:
//   1. se já existe Owner ativo, para (idempotente: com o mesmo e-mail,
//      informa que o bootstrap já foi feito; com outro, recusa);
//   2. localiza o login (auth.users) do e-mail; se não existir, cria por
//      convite do Supabase Auth — a pessoa recebe o e-mail e cria a senha
//      em /redefinir-senha?primeiro-acesso=1 (nenhuma senha passa por aqui);
//   3. chama public.bootstrap_platform_owner (0064), que só executa para
//      service_role, recusa se já houver Owner e registra auditoria.
//
// Não cria empresa, usuário de empresa, nem acesso a dados operacionais.

import { pathToFileURL } from "node:url";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseArgs(argv) {
  const args = { email: null, name: null, appUrl: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`Faltou o valor de ${arg}.`);
      i += 1;
      return value;
    };
    if (arg === "--email") args.email = next().trim().toLowerCase();
    else if (arg === "--name") args.name = next().trim();
    else if (arg === "--app-url") args.appUrl = next().trim();
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  if (!args.email || !EMAIL_RE.test(args.email)) throw new Error("Informe --email válido.");
  if (!args.name) throw new Error("Informe --name.");
  if (args.appUrl) {
    const url = new URL(args.appUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("--app-url deve usar https (ou localhost).");
    args.appUrl = url.origin;
  }
  return args;
}

async function findAuthUserId(admin, email) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Não foi possível consultar os logins: ${error.message}`);
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Executa o bootstrap com um cliente service_role já criado (injetável nos testes). */
export async function bootstrapOwner(admin, { email, name, appUrl, dryRun }, log = console.log) {
  const { data: owners, error: ownersError } = await admin
    .from("platform_members")
    .select("email")
    .eq("platform_role", "OWNER")
    .eq("status", "active");
  if (ownersError) throw new Error(`Não foi possível verificar os Owners: ${ownersError.message}`);
  if ((owners ?? []).length > 0) {
    if (owners.some((o) => (o.email ?? "").toLowerCase() === email)) {
      log(`Nada a fazer: ${email} já é Platform Owner ativo.`);
      return { status: "already_owner" };
    }
    throw new Error("Já existe um Platform Owner ativo. Novos Owners são concedidos por um Owner, na Administração Central.");
  }

  let authUserId = await findAuthUserId(admin, email);
  let invited = false;
  if (!authUserId) {
    if (!appUrl) throw new Error("Não há login para este e-mail. Informe --app-url para enviar o convite de primeiro acesso.");
    const redirectTo = `${appUrl}/redefinir-senha?primeiro-acesso=1&next=${encodeURIComponent("/admincentral")}`;
    if (dryRun) {
      log(`[simulação] Enviaria convite de primeiro acesso para ${email} (retorno: ${redirectTo}).`);
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { educa_password_pending: true } });
      if (error || !data?.user) throw new Error(`Não foi possível enviar o convite: ${error?.message ?? "sem usuário criado"}`);
      authUserId = data.user.id;
      invited = true;
      log(`Convite de primeiro acesso enviado para ${email}.`);
    }
  }

  if (dryRun) {
    log(`[simulação] Registraria ${name} <${email}> como Platform Owner.`);
    return { status: "dry_run" };
  }

  const { error } = await admin.rpc("bootstrap_platform_owner", { p_auth_user_id: authUserId, p_name: name, p_email: email });
  if (error) throw new Error(`O banco recusou o bootstrap: ${error.message}`);
  log(`Platform Owner registrado: ${name} <${email}>.${invited ? " A pessoa cria a senha pelo link do e-mail." : " A pessoa entra com a senha que já tem."}`);
  return { status: "created", invited };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Defina SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no ambiente desta máquina.");
  args.appUrl ??= process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await bootstrapOwner(admin, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
