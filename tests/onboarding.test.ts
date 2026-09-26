// Onboarding & identidade — regras puras (sem rede, sem segredo).
// As regras de autorização em si são do banco e estão provadas em
// tests/onboarding-sql.test.ts; aqui ficam: estado de acesso, destino
// pós-login, rotas públicas, schemas estritos (nada de company_id/role
// vindo do cliente), links, entrega de convite, bootstrap do Owner e
// invariantes de segurança do código (service_role fora do navegador).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isGuestOnlyPath, isPublicPath, postLoginDestination, resolveAccessState, userScopedKeys } from "@/lib/onboarding/access";
import {
  acceptInvitationSchema,
  buildFirstAccessUrl,
  buildInviteUrl,
  buildRecoveryCallbackUrl,
  createCompanyRpcArgs,
  createCompanySchema,
  createInvitationSchema,
  deliverAuthInvite,
  invitationStatus,
  inviteCompanyAdminSchema,
  invitePlatformMemberSchema,
  newPasswordSchema,
  resolveAppOrigin,
  userAccessStatus,
  type InviteByEmail,
} from "@/lib/onboarding/invitations";
import { authLinkLandingPath, parseAuthHash } from "@/lib/onboarding/auth-hash";
import type { PlatformContext, SessionContext, TenantContext } from "@/lib/session/types";
import { bootstrapOwner, parseArgs } from "../scripts/bootstrap-platform-owner.mjs";

const TOKEN = "a".repeat(64);
const tenant = { user: { id: "u1" }, branches: [] } as unknown as TenantContext;
const platform = { role: "ADMIN", permissions: [] } as unknown as PlatformContext;
const ctx = (over: Partial<SessionContext>): Pick<SessionContext, "access" | "tenant" | "platform"> => ({ access: "active", tenant: null, platform: null, ...over });

describe("estado de acesso", () => {
  test("login sem cadastro → unlinked; cadastro inativo → inactive", () => {
    assert.equal(resolveAccessState(null, false), "unlinked");
    assert.equal(resolveAccessState({ status: "inactive" }, false), "inactive");
    // inativo nunca vira active, mesmo que algo devolva tenant
    assert.equal(resolveAccessState({ status: "inactive" }, true), "inactive");
  });
  test("cadastro ativo com/sem contexto de empresa", () => {
    assert.equal(resolveAccessState({ status: "active" }, true), "active");
    assert.equal(resolveAccessState({ status: "active" }, false), "no_company");
  });
});

describe("destino depois do login", () => {
  test("usuário comum → ERP; next interno respeitado", () => {
    assert.equal(postLoginDestination(ctx({ tenant })), "/");
    assert.equal(postLoginDestination(ctx({ tenant }), "/comercial/pedidos"), "/comercial/pedidos");
    assert.equal(postLoginDestination(ctx({ tenant }), "/admin/users"), "/admin/users");
  });
  test("membro só da plataforma → /admincentral, nunca o ERP", () => {
    assert.equal(postLoginDestination(ctx({ access: "unlinked", platform })), "/admincentral");
    assert.equal(postLoginDestination(ctx({ access: "unlinked", platform }), "/comercial"), "/admincentral");
    assert.equal(postLoginDestination(ctx({ access: "unlinked", platform }), "/admincentral/companies"), "/admincentral/companies");
  });
  test("Company Admin não é levado para /admincentral por next", () => {
    assert.equal(postLoginDestination(ctx({ tenant }), "/admincentral"), "/");
    assert.equal(postLoginDestination(ctx({ tenant }), "/admincentral/platform-members"), "/");
  });
  test("sem contexto (sem vínculo, inativo, sem empresa) → /acesso", () => {
    assert.equal(postLoginDestination(ctx({ access: "unlinked" })), "/acesso");
    assert.equal(postLoginDestination(ctx({ access: "inactive" }), "/comercial"), "/acesso");
    assert.equal(postLoginDestination(ctx({ access: "no_company" })), "/acesso");
    // inativo com tenant residual continua sem acesso
    assert.equal(postLoginDestination(ctx({ access: "inactive", tenant })), "/acesso");
  });
  test("next externo nunca vira redirect (open redirect)", () => {
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      assert.equal(postLoginDestination(ctx({ tenant }), evil), "/");
    }
  });
  test("convite em andamento volta ao convite, qualquer que seja o contexto", () => {
    assert.equal(postLoginDestination(ctx({ access: "unlinked" }), `/convite/${TOKEN}`), `/convite/${TOKEN}`);
  });
});

describe("rotas públicas (proxy)", () => {
  test("abrem sem sessão", () => {
    for (const p of ["/login", "/recuperar-senha", "/redefinir-senha", `/convite/${TOKEN}`, "/auth/callback"]) assert.equal(isPublicPath(p), true, p);
  });
  test("todo o resto exige sessão — comparação por segmento", () => {
    for (const p of ["/", "/admin", "/admincentral", "/acesso", "/comercial", "/convitex", "/login-falso", "/loginx/a"]) assert.equal(isPublicPath(p), false, p);
  });
  test("só-visitante: login e recuperação; convite e redefinição aceitam sessão", () => {
    assert.equal(isGuestOnlyPath("/login"), true);
    assert.equal(isGuestOnlyPath("/recuperar-senha"), true);
    assert.equal(isGuestOnlyPath(`/convite/${TOKEN}`), false);
    assert.equal(isGuestOnlyPath("/redefinir-senha"), false);
  });
});

describe("schemas estritos — o cliente não injeta contexto", () => {
  const injected = [{ company_id: "c" }, { companyId: "c" }, { role_id: "r" }, { roleId: "r" }, { auth_user_id: "a" }, { authUserId: "a" }, { permissions: ["users.update"] }, { user_id: "u" }];

  test("convite de usuário: só ttlHours", () => {
    assert.equal(createInvitationSchema.safeParse({}).success, true);
    for (const extra of injected) {
      const r = createInvitationSchema.safeParse(extra);
      assert.equal(r.success, false, JSON.stringify(extra));
      assert.match(r.error!.issues[0].message, /Campo não permitido/);
    }
    assert.equal(createInvitationSchema.safeParse({ ttlHours: 0 }).success, false);
    assert.equal(createInvitationSchema.safeParse({ ttlHours: 721 }).success, false);
  });

  test("aceite: só o token (64 hex)", () => {
    assert.equal(acceptInvitationSchema.safeParse({ token: TOKEN }).success, true);
    assert.equal(acceptInvitationSchema.safeParse({ token: "curto" }).success, false);
    assert.equal(acceptInvitationSchema.safeParse({ token: TOKEN.toUpperCase() }).success, false);
    for (const extra of injected) assert.equal(acceptInvitationSchema.safeParse({ token: TOKEN, ...extra }).success, false);
  });

  test("primeiro admin da empresa: nome + e-mail, papel NÃO é escolhido pelo cliente", () => {
    const ok = inviteCompanyAdminSchema.safeParse({ name: " Maria ", email: " Maria@Empresa.COM " });
    assert.equal(ok.success, true);
    assert.deepEqual(ok.data, { name: "Maria", email: "maria@empresa.com" });
    for (const extra of [...injected, { role: "admin" }, { platformRole: "OWNER" }]) {
      assert.equal(inviteCompanyAdminSchema.safeParse({ name: "M", email: "m@e.com", ...extra }).success, false);
    }
  });

  test("membro da plataforma: papel limitado a OWNER/ADMIN; sem authUserId do cliente", () => {
    assert.equal(invitePlatformMemberSchema.safeParse({ name: "A", email: "a@b.co", platformRole: "ADMIN" }).success, true);
    assert.equal(invitePlatformMemberSchema.safeParse({ name: "A", email: "a@b.co", platformRole: "SUPERUSER" }).success, false);
    assert.equal(invitePlatformMemberSchema.safeParse({ name: "A", email: "a@b.co", platformRole: "ADMIN", authUserId: "x" }).success, false);
  });

  test("empresa: nome obrigatório, unidade inicial com código E nome, sem campos extras", () => {
    assert.equal(createCompanySchema.safeParse({ name: "" }).success, false);
    assert.equal(createCompanySchema.safeParse({ name: "X", branchCode: "MTZ" }).success, false);
    assert.equal(createCompanySchema.safeParse({ name: "X", email: "invalido" }).success, false);
    assert.equal(createCompanySchema.safeParse({ name: "X", lifecycleStatus: "SUSPENDED" }).success, false);
    assert.equal(createCompanySchema.safeParse({ name: "X", company_id: "c" }).success, false);
    assert.equal(createCompanySchema.safeParse({ name: "X", status: "active" }).success, false);
    const parsed = createCompanySchema.parse({ name: " Nova ", email: "", branchCode: "MTZ", branchName: "Matriz" });
    const args = createCompanyRpcArgs(parsed);
    assert.equal(args.p_name, "Nova");
    assert.equal(args.p_email, null);
    assert.equal(args.p_lifecycle_status, "TRIAL");
    assert.equal(args.p_branch_code, "MTZ");
    assert.deepEqual(Object.keys(args).filter((k) => /company_id|role|permission|auth/.test(k)), []);
  });

  test("política de senha", () => {
    assert.equal(newPasswordSchema.safeParse("abc12345").success, true);
    assert.equal(newPasswordSchema.safeParse("abc123").success, false);
    assert.equal(newPasswordSchema.safeParse("abcdefgh").success, false);
    assert.equal(newPasswordSchema.safeParse("12345678").success, false);
    assert.equal(newPasswordSchema.safeParse("a1".repeat(40)).success, false);
  });
});

describe("links", () => {
  test("origem configurada no servidor vence o Host da requisição", () => {
    assert.equal(resolveAppOrigin("https://erp.exemplo.com/qualquer", "https://atacante.example"), "https://erp.exemplo.com");
    assert.equal(resolveAppOrigin(undefined, "https://preview.vercel.app/x"), "https://preview.vercel.app");
    assert.equal(resolveAppOrigin("javascript:alert(1)", "https://ok.example"), "https://ok.example");
    assert.equal(resolveAppOrigin("não é url", "https://ok.example"), "https://ok.example");
  });
  test("link do convite só com token válido", () => {
    assert.equal(buildInviteUrl("https://erp.exemplo.com/", TOKEN), `https://erp.exemplo.com/convite/${TOKEN}`);
    assert.throws(() => buildInviteUrl("https://erp.exemplo.com", "../../etc"));
  });
  test("recuperação volta por /auth/callback para /redefinir-senha; primeiro acesso leva next", () => {
    assert.equal(buildRecoveryCallbackUrl("https://erp.exemplo.com"), "https://erp.exemplo.com/auth/callback?next=%2Fredefinir-senha");
    assert.equal(buildFirstAccessUrl("https://erp.exemplo.com", "/admincentral"), "https://erp.exemplo.com/redefinir-senha?primeiro-acesso=1&next=%2Fadmincentral");
  });
});

describe("entrega do convite (Supabase Auth)", () => {
  const fake = (result: Awaited<ReturnType<InviteByEmail>> | Error): InviteByEmail => async () => {
    if (result instanceof Error) throw result;
    return result;
  };
  test("enviado: devolve o login criado", async () => {
    const d = await deliverAuthInvite(fake({ data: { user: { id: "auth-1" } }, error: null }), "a@b.co", "https://x/convite/t");
    assert.deepEqual(d, { delivered: true, authUserId: "auth-1" });
  });
  test("conta existente não é erro: link para entrega manual", async () => {
    const d = await deliverAuthInvite(fake({ data: null, error: { code: "email_exists", message: "A user with this email address has already been registered" } }), "a@b.co", "u");
    assert.deepEqual(d, { delivered: false, reason: "existing_account" });
  });
  test("falha do provedor não vaza detalhe", async () => {
    assert.deepEqual(await deliverAuthInvite(fake({ data: null, error: { status: 500, message: "SMTP 535 auth failed for smtp.secret.host" } }), "a@b.co", "u"), { delivered: false, reason: "email_unavailable" });
    assert.deepEqual(await deliverAuthInvite(fake(new Error("network")), "a@b.co", "u"), { delivered: false, reason: "email_unavailable" });
  });
  test("o convite marca a senha como pendente e usa o redirect informado", async () => {
    let seen: unknown;
    await deliverAuthInvite(async (email, options) => {
      seen = { email, options };
      return { data: { user: { id: "x" } }, error: null };
    }, "a@b.co", "https://erp/convite/t");
    assert.deepEqual(seen, { email: "a@b.co", options: { redirectTo: "https://erp/convite/t", data: { educa_password_pending: true } } });
  });
});

describe("situação de convite e de acesso", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  test("pendente vencido vira expirado", () => {
    assert.equal(invitationStatus({ status: "pending", expires_at: "2026-01-10T11:59:00Z" }, now), "expired");
    assert.equal(invitationStatus({ status: "pending", expires_at: "2026-01-11T00:00:00Z" }, now), "pending");
    assert.equal(invitationStatus({ status: "accepted", expires_at: "2026-01-01T00:00:00Z" }, now), "accepted");
  });
  test("estado do cadastro na Administração da Empresa", () => {
    const pending = { status: "pending", expires_at: "2026-01-11T00:00:00Z" };
    const expired = { status: "pending", expires_at: "2026-01-09T00:00:00Z" };
    assert.equal(userAccessStatus({ status: "inactive", has_login: true }, null, now), "inactive");
    assert.equal(userAccessStatus({ status: "active", has_login: true }, pending, now), "active");
    assert.equal(userAccessStatus({ status: "active", has_login: false }, pending, now), "invite_pending");
    assert.equal(userAccessStatus({ status: "active", has_login: false }, expired, now), "invite_expired");
    assert.equal(userAccessStatus({ status: "active", has_login: false }, { status: "revoked", expires_at: "2026-02-01T00:00:00Z" }, now), "no_login");
    assert.equal(userAccessStatus({ status: "active", has_login: false }, null, now), "no_login");
  });
});

describe("sessão no fragmento do link de convite", () => {
  test("lê tokens e tipo", () => {
    assert.deepEqual(parseAuthHash("#access_token=at&refresh_token=rt&type=invite&expires_in=3600"), { kind: "session", accessToken: "at", refreshToken: "rt", type: "invite" });
  });
  test("erro do Auth vira mensagem neutra", () => {
    const r = parseAuthHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    assert.equal(r.kind, "error");
    assert.match((r as { message: string }).message, /expirou/);
  });
  test("sem fragmento ou incompleto → nada", () => {
    assert.deepEqual(parseAuthHash(""), { kind: "none" });
    assert.deepEqual(parseAuthHash("#access_token=only"), { kind: "none" });
  });
  test("link de senha que caiu no Site URL vai para /redefinir-senha (destino fixo)", () => {
    // Recuperação disparada pelo painel do Supabase: sem redirect_to, cai em "/".
    assert.equal(authLinkLandingPath("#access_token=at&refresh_token=rt&type=recovery"), "/redefinir-senha");
    // Convite cujo redirect_to não estava na lista: primeiro acesso.
    assert.equal(authLinkLandingPath("#access_token=at&refresh_token=rt&type=invite"), "/redefinir-senha?primeiro-acesso=1");
    assert.equal(authLinkLandingPath("#access_token=at&refresh_token=rt&type=magiclink"), "/redefinir-senha");
    // Link expirado/erro: a página de senha explica e oferece novo link.
    assert.equal(authLinkLandingPath("#error=access_denied&error_code=otp_expired"), "/redefinir-senha");
  });
  test("fragmento sem sessão, tipo desconhecido ou sem tipo → não redireciona", () => {
    assert.equal(authLinkLandingPath(""), null);
    assert.equal(authLinkLandingPath("#secao"), null);
    assert.equal(authLinkLandingPath("#access_token=at&refresh_token=rt"), null);
    assert.equal(authLinkLandingPath("#access_token=at&refresh_token=rt&type=https://evil.example"), null);
  });
  test("nada no link escolhe o destino (sem open redirect)", () => {
    for (const hash of ["#access_token=a&refresh_token=b&type=recovery&redirect_to=https://evil.example", "#access_token=a&refresh_token=b&type=invite&next=//evil.example"]) {
      const target = authLinkLandingPath(hash);
      assert.ok(target && target.startsWith("/redefinir-senha") && !/evil/.test(target), String(target));
    }
  });
});

describe("logout limpa o que é do usuário", () => {
  test("remove unidade em foco de qualquer usuário; mantém preferências neutras", () => {
    assert.deepEqual(userScopedKeys(["educa-branch:u1", "educa-branch:u2", "educa-theme", "educa-sidebar-collapsed"]), ["educa-branch:u1", "educa-branch:u2"]);
  });
});

describe("bootstrap do primeiro Platform Owner (script de servidor)", () => {
  test("argumentos obrigatórios e seguros", () => {
    assert.deepEqual(parseArgs(["--email", " Dono@Educa.COM ", "--name", "Dono", "--app-url", "https://erp.exemplo.com/x"]), { email: "dono@educa.com", name: "Dono", appUrl: "https://erp.exemplo.com", dryRun: false });
    assert.throws(() => parseArgs(["--name", "Dono"]), /--email/);
    assert.throws(() => parseArgs(["--email", "d@e.co"]), /--name/);
    assert.throws(() => parseArgs(["--email", "d@e.co", "--name", "D", "--app-url", "http://inseguro.example"]), /https/);
    assert.throws(() => parseArgs(["--email", "d@e.co", "--name", "D", "--role", "OWNER"]), /desconhecido/);
  });

  function fakeAdmin({ owners = [] as Array<{ email: string }>, authUsers = [] as Array<{ id: string; email: string }> } = {}) {
    const calls: string[] = [];
    const admin = {
      from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: owners, error: null }) }) }) }),
      auth: {
        admin: {
          listUsers: async () => ({ data: { users: authUsers }, error: null }),
          inviteUserByEmail: async (email: string, opts: { redirectTo: string }) => {
            calls.push(`invite:${email}:${opts.redirectTo}`);
            return { data: { user: { id: "new-auth" } }, error: null };
          },
        },
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${fn}:${args.p_auth_user_id}`);
        return { data: {}, error: null };
      },
    };
    return { admin, calls };
  }
  const quiet = () => {};

  test("idempotente: mesmo e-mail já Owner → nada a fazer", async () => {
    const { admin, calls } = fakeAdmin({ owners: [{ email: "dono@educa.com" }] });
    assert.deepEqual(await bootstrapOwner(admin, { email: "dono@educa.com", name: "D", appUrl: null, dryRun: false }, quiet), { status: "already_owner" });
    assert.deepEqual(calls, []);
  });
  test("neon: Owner já existente ganha identidade no provedor + vínculo (virada), sem novo registro", async () => {
    const { admin, calls } = fakeAdmin({ owners: [{ email: "dono@educa.com" }] });
    const provisioned: string[] = [];
    const provision = async ({ email, redirectTo }: { email: string; redirectTo: string }) => {
      provisioned.push(`${email}:${redirectTo}`);
      return { authUserId: "auth-1", delivered: true };
    };
    assert.deepEqual(
      await bootstrapOwner(admin, { email: "dono@educa.com", name: "D", appUrl: "https://erp.exemplo.com", dryRun: false }, quiet, provision),
      { status: "already_owner", provisioned: true, invited: true }
    );
    assert.deepEqual(provisioned, ["dono@educa.com:https://erp.exemplo.com/redefinir-senha?primeiro-acesso=1&next=%2Fadmincentral"]);
    assert.deepEqual(calls, []);
    await assert.rejects(bootstrapOwner(admin, { email: "dono@educa.com", name: "D", appUrl: null, dryRun: false }, quiet, provision), /--app-url/);
  });
  test("neon: outro Owner já ativo continua recusando um segundo Owner", async () => {
    const { admin } = fakeAdmin({ owners: [{ email: "outro@educa.com" }] });
    const provision = async () => ({ authUserId: "x", delivered: true });
    await assert.rejects(bootstrapOwner(admin, { email: "dono@educa.com", name: "D", appUrl: "https://x.com", dryRun: false }, quiet, provision), /Já existe um Platform Owner/);
  });
  test("já existe outro Owner → recusa sem criar login", async () => {
    const { admin, calls } = fakeAdmin({ owners: [{ email: "outro@educa.com" }] });
    await assert.rejects(bootstrapOwner(admin, { email: "dono@educa.com", name: "D", appUrl: "https://x.com", dryRun: false }, quiet), /Já existe um Platform Owner/);
    assert.deepEqual(calls, []);
  });
  test("login existente → só registra (sem convite)", async () => {
    const { admin, calls } = fakeAdmin({ authUsers: [{ id: "auth-9", email: "Dono@Educa.com" }] });
    await bootstrapOwner(admin, { email: "dono@educa.com", name: "D", appUrl: null, dryRun: false }, quiet);
    assert.deepEqual(calls, ["rpc:bootstrap_platform_owner:auth-9"]);
  });
  test("sem login → convite de primeiro acesso para /admincentral, depois registra", async () => {
    const { admin, calls } = fakeAdmin();
    await bootstrapOwner(admin, { email: "dono@educa.com", name: "D", appUrl: "https://erp.exemplo.com", dryRun: false }, quiet);
    assert.deepEqual(calls, ["invite:dono@educa.com:https://erp.exemplo.com/redefinir-senha?primeiro-acesso=1&next=%2Fadmincentral", "rpc:bootstrap_platform_owner:new-auth"]);
  });
  test("sem login e sem --app-url → erro claro; simulação não escreve nada", async () => {
    await assert.rejects(bootstrapOwner(fakeAdmin().admin, { email: "d@e.co", name: "D", appUrl: null, dryRun: false }, quiet), /--app-url/);
    const { admin, calls } = fakeAdmin();
    assert.deepEqual(await bootstrapOwner(admin, { email: "d@e.co", name: "D", appUrl: "https://x.com", dryRun: true }, quiet), { status: "dry_run" });
    assert.deepEqual(calls, []);
  });
});

describe("invariantes de segurança do código", () => {
  const root = path.join(process.cwd(), "src");
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }
  const all = files(root).map((file) => ({ file: path.relative(process.cwd(), file), text: readFileSync(file, "utf8") }));

  test("nenhum módulo de navegador toca service_role", () => {
    const offenders = all.filter(({ text }) => /^["']use client["']/m.test(text) && /supabase\/admin|SERVICE_ROLE/.test(text)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });

  test("service_role só em código de servidor (server-only ou route handler)", () => {
    const isRouteHandler = (file: string) => /^src\/app\/.*\/route\.ts$/.test(file.split(path.sep).join("/"));
    const offenders = all.filter(({ file, text }) => /createAdminClient\(\)/.test(text) && !/import "server-only"/.test(text) && !isRouteHandler(file)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });

  test("onboarding: service_role usado apenas para enviar o e-mail do Auth", () => {
    const text = readFileSync(path.join(root, "lib/api/onboarding-handlers.ts"), "utf8");
    assert.equal((text.match(/createAdminClient\(\)/g) ?? []).length, 1);
    assert.match(text, /admin\.auth\.admin\.inviteUserByEmail/);
    assert.doesNotMatch(text, /admin\.(from|rpc)\(/);
  });

  test("onboarding: nenhuma RPC recebe company/role/permission/auth id do corpo", () => {
    const text = readFileSync(path.join(root, "lib/api/onboarding-handlers.ts"), "utf8");
    assert.doesNotMatch(text, /body\.(company|role|permission|auth)/i);
    assert.doesNotMatch(text, /p_company_id:\s*body/);
  });

  test("não existe rota de bootstrap de Owner na aplicação", () => {
    const offenders = all.filter(({ text }) => /bootstrap_platform_owner/.test(text)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });

  test("nenhuma variável NEXT_PUBLIC_ carrega segredo de servidor", () => {
    const extra = ["scripts/bootstrap-platform-owner.mjs", ".env.local.example", "next.config.ts"]
      .filter((f) => existsSync(f))
      .map((file) => ({ file, text: readFileSync(file, "utf8") }));
    const offenders = [...all, ...extra].filter(({ text }) => /NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET|PRIVATE)/.test(text)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });

  test("a aplicação nunca grava users.auth_user_id (só o aceite de convite, no banco)", () => {
    // Leitura e filtros (.eq/.select) são permitidos; escrita não.
    const writes = all.filter(({ text }) => /\.(insert|update|upsert)\([^)]*auth_user_id/.test(text) || /(?<!p_)auth_user_id\s*:\s*(body|input|payload|request)/.test(text));
    assert.deepEqual(writes.map((f) => f.file), []);
  });

  test("membro da plataforma: alteração exige membro existente e mantém o e-mail do banco", () => {
    const text = readFileSync(path.join(root, "lib/api/platform-handlers.ts"), "utf8");
    const fn = text.slice(text.indexOf("export async function upsertPlatformMember"), text.indexOf("export async function listPlatformPermissions"));
    assert.match(fn, /from\("platform_members"\)\.select\("email"\)/);
    assert.match(fn, /p_email:\s*existing\.data\.email/);
    assert.doesNotMatch(fn, /p_email:\s*body/);
  });

  test("convite de membro: Owner só por Owner, checado ANTES de criar login no Auth", () => {
    const text = readFileSync(path.join(root, "lib/api/onboarding-handlers.ts"), "utf8");
    const fn = text.slice(text.indexOf("export async function invitePlatformMember"));
    const ownerCheck = fn.search(/platformRole === "OWNER" && !owner\.data/);
    const send = fn.indexOf("sendAuthInvite(");
    assert.ok(ownerCheck > 0 && send > ownerCheck, "checagem de Owner precede o envio do convite");
  });

  test("recuperação de senha: callback troca o código no servidor com o id do fluxo PKCE", () => {
    const route = readFileSync(path.join(root, "app/auth/callback/route.ts"), "utf8");
    assert.match(route, /exchangeCodeForSession\(code, flowId \? \{ flowId \} : undefined\)/);
    assert.match(route, /safeNextPath\(/);
    const client = readFileSync(path.join(root, "lib/supabase/client.ts"), "utf8");
    assert.match(client, /appendPkceFlowIdToRedirects:\s*true/);
  });
});
