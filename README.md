# ATLAS.ERP

ERP empresarial, modular e generalista: comercial e CRM, compras, estoque e
logística, produção, financeiro, fiscal, custos e controladoria, qualidade,
projetos e serviços, ativos e manutenção, workflow e governança — todos na
mesma base, com permissões por papel e isolamento entre empresas.

Criado por Marcus Valério.

## Arquitetura

Um único projeto (Next.js, um deploy na Vercel):

| Endereço | O que é | Acesso |
|---|---|---|
| `/` | Landing pública (HTML estático em `public/landing/`, gerado de `landing/src/`) | público |
| `/login`, `/convite/…`, `/recuperar-senha`, `/redefinir-senha` | entrada e fluxos de acesso | público |
| `/app` | o ERP | autenticado |
| `/app/admin` | Administração da Empresa (usuários, papéis, estrutura) | administrador da empresa |
| `/app/admincentral` | Administração Central (governança da plataforma) | Owner / Admin da plataforma |
| `/api/*` | API do sistema | autenticada, RBAC no banco |

Endereços antigos do ERP (`/comercial/…`, `/admin/…`) respondem **308** para
`/app/…`; os PDFs com o nome anterior respondem 308 para os atuais.

**Banco e autenticação.** O código funciona com dois provedores, escolhidos
por variável de ambiente (`AUTH_PROVIDER`, `DATA_BACKEND`):

- **Produção hoje:** Supabase (PostgreSQL + Supabase Auth).
- **Destino:** Neon (PostgreSQL + Neon Auth) — já em uso na homologação e nos
  testes locais.

O estado da migração, o que ainda depende do Supabase e o plano para
desligá-lo estão em **[docs/SUPABASE_PARA_NEON.md](docs/SUPABASE_PARA_NEON.md)**.

**Autorização.** RBAC e Row Level Security no próprio banco (funções
`SECURITY DEFINER`, `has_permission`). Governança separada em três níveis:
plataforma (Owner, Admin da plataforma), administração da empresa
(Administrador) e operação (Gerente, Operador, Vendedor, Somente leitura e
papéis próprios). Ver **[docs/RBAC.md](docs/RBAC.md)** e
**[docs/ONBOARDING.md](docs/ONBOARDING.md)**.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router) + TypeScript, React 19
- Tailwind CSS v4, Radix UI, lucide-react, Recharts
- PostgreSQL (Supabase hoje; Neon no destino) com RLS
- [Zod](https://zod.dev) para validação no servidor
- Fontes servidas pelo próprio app: Instrument Sans, Instrument Serif, JetBrains Mono

## Desenvolvimento

```bash
npm install
cp .env.local.example .env.local   # preencha as variáveis do ambiente escolhido
npm run dev
```

```bash
npm run lint             # eslint
npx tsc --noEmit         # typecheck
npm test                 # testes (os de banco rodam com POC_DATABASE_OWNER_URL)
npm run build            # build de produção (copia os PDFs para a landing)
npm run landing:build    # regenera public/landing a partir de landing/src
npm run manuals:pdf      # regenera os PDFs dos manuais a partir de docs/manual
```

A pilha local completa (PostgreSQL descartável + dublê do Neon Auth + caixa de
e-mail local) está descrita em `poc/neon-full/README.md`.

## Integração com o ORION.WMS

Contrato: [`docs/INTEGRACAO-ATLAS-ORION.md`](docs/INTEGRACAO-ATLAS-ORION.md) e fixtures em `docs/contrato/` (conferência: `node scripts/check-contract.mjs`).
Código: migrations `0126_integracao_orion.sql` e `0127_orion_aplicar_eventos.sql`, `src/lib/integrations/orion/**`,
`src/app/api/integrations/orion/**`, `src/app/.well-known/astraeus-jwks.json`, telas `/app/admin/integracoes/orion` e `/app/admincentral/orion`.

| Variável (server-only) | Uso |
|---|---|
| `ORION_URL` | URL padrão da instalação do ORION (sugerida no vínculo). |
| `ORION_INSTALL_KEY_ID`, `ORION_INSTALL_SECRET` | Credencial de instalação (HMAC) para `POST {ORION}/api/atlas/v1/links` — iguais nas duas instalações. |
| `INTEGRATION_ENCRYPTION_KEY` | 32 bytes (base64 ou hex) para cifrar os segredos por empresa com AES-256-GCM. Gerar: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Trocar a chave invalida os segredos guardados (revincule as empresas). |
| `ATLAS_SSO_PRIVATE_JWK` | JWK privado ES256 (P-256) com `kid`, usado no launch token do SSO. Gerar: `node scripts/orion-sso-keygen.mjs atlas-sso-AAAA-MM`. |
| `ATLAS_SSO_PREVIOUS_PUBLIC_JWKS` | Opcional: `{"keys":[…]}` com as públicas anteriores, publicadas no JWKS durante a rotação (§2.8). |
| `CRON_SECRET` | Protege `/api/integrations/orion/v1/outbox/process` (Vercel Cron a cada minuto, `vercel.json`: `Authorization: Bearer $CRON_SECRET`). |
| `APP_URL` | Também é o `iss` do launch token (o ORION usa `ATLAS_SSO_ISSUER` = este valor). |

No ORION: `ERP_WEBHOOK_URL = {APP_URL}/api/integrations/orion/v1/events`, `ATLAS_JWKS_URL = {APP_URL}/.well-known/astraeus-jwks.json`.

Ativação de uma empresa: Administração Central › ORION.WMS (contratar + vincular) → admin da empresa habilita em Módulos →
Integrações › ORION (depósitos, etapas, acessos) → carga inicial → reconciliação zerada ativa a integração.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/manual/](docs/manual/README.md) | Manual do Usuário e Manual de Administração (Markdown + PDF) |
| [docs/SUPABASE_PARA_NEON.md](docs/SUPABASE_PARA_NEON.md) | Supabase × Neon: dependências, e-mails, variáveis, cutover, rollback, remoção |
| [docs/CUTOVER_RUNBOOK.md](docs/CUTOVER_RUNBOOK.md) | Passo a passo da virada de produção para o Neon |
| [docs/RBAC.md](docs/RBAC.md) | Usuários, papéis, permissões e RLS |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Owner, empresas, convites e primeiro acesso |
| [docs/UI.md](docs/UI.md) | Design system e padrões de tela |
| [docs/TESTING.md](docs/TESTING.md) | Testes automatizados e roteiros |
| [docs/homologacao/](docs/homologacao/README.md) | Ambiente de homologação (Neon) |
| Módulos | `docs/COMMERCIAL.md`, `INVENTORY.md`, `PURCHASING.md`, `LOGISTICS.md`, `PRODUCTION.md`, `FINANCE.md`, `FISCAL.md`, `COSTS.md`, `CONTROLLING.md`, `CRM.md`, `QUALITY.md`, `PROJECTS_SERVICES.md`, `ASSETS.md`, `WORKFLOWS.md`, `IMPORT_EXPORT.md`, `REPORTING.md`, `SETTINGS.md`, `MASTER_DATA.md` |

Registros históricos (mantidos como estavam, com o nome anterior do produto):
`docs/SUPABASE_TO_NEON_AUDIT.md`, `docs/NEON_AUTH_MIGRATION.md`,
`docs/PRE_CUTOVER_CHECKLIST.md`, `docs/landing/`, `poc/`.

## Nomes técnicos mantidos

O produto se chamava EDUCA.ERP. O nome mudou só como marca: identificadores
técnicos continuam iguais para não quebrar sessão, convites, preferências,
banco ou integrações — repositório `educa.erp`, projeto Vercel `educaerp`,
domínio `educaerp.vercel.app`, projetos Neon `educa-*`, banco `educa`, papel
`educa_app`, cookie `educa_session`, GUC `educa.auth_link`, chaves `educa-*`
do navegador e a variável `EDUCA_CUTOVER_NEON_CONFIRMADO`.
