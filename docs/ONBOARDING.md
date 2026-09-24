# Onboarding & Identidade

Como uma pessoa real sai de "existe um cadastro no banco" para "entra com
segurança, recebe o contexto certo e usa exatamente o que foi autorizado".

**Princípio:** nenhuma tela, rota ou script concede acesso. Quem decide é o
banco (RLS, `has_permission`, `has_platform_permission` e as funções
`SECURITY DEFINER` das migrations 0071 e 0072). As rotas usam o cliente do **usuário**;
o `service_role` só aparece para enviar o e-mail de convite do Supabase Auth
e no script de bootstrap, que roda fora da aplicação.

---

## 1. Por que a migration 0071 existe

O modelo já existente não suportava o fluxo. Isso foi verificado antes de
escrever a migration:

| Falta | Consequência |
|---|---|
| Não havia estrutura de convite (validade, uso único, vínculo empresa + cadastro) | O Auth sozinho não sabe a qual `public.users` um login pertence, e o cliente não pode decidir isso |
| `platform.companies.create` existia sem nenhuma função que a usasse; a RLS de `companies` não permite INSERT | Não era possível criar empresa |
| `bootstrap_admin_user` (0005) não está instalada e escrevia em `user_companies` / `user_roles.company_id`, que não existem mais | Não havia caminho para o **primeiro** administrador de uma empresa |

A 0071 é **aditiva**:

- não altera nenhuma tabela, policy, função, papel ou permissão existente;
- não cria permissão nova;
- não dá à plataforma acesso a dados operacionais.

Conteúdo:

- **`user_invitations`**:
  - o token é gravado só como hash SHA-256;
  - o convite expira (1 a 720 h, padrão 7 dias) e é de uso único;
  - há no máximo um convite pendente por cadastro;
  - a leitura é controlada por RLS (`users.read` da empresa);
  - não há escrita direta pelo cliente.
- **Funções do Company Admin** (`users.update` na empresa **do cadastro**):
  - `fn_create_user_invitation`;
  - `fn_revoke_user_invitation`.
  - Se o cadastro **já tem papéis**, o convite exige também
    `roles.manage`. Dar login a um cadastro é entregar os papéis dele;
    sem essa regra, quem só edita cadastros (o papel de sistema
    `operador` tem `users.update`) poderia trocar o e-mail de um cadastro
    administrador para o próprio e convidar a si mesmo. Encontrado no E2E
    real e corrigido.
- **Funções do convidado:**
  - `fn_get_invitation`: prévia pelo token, sem ids e com o e-mail mascarado;
  - `fn_accept_user_invitation`: a identidade vem de `auth.uid()`; o
    e-mail do login tem de ser igual ao do convite e estar confirmado; um
    login liga-se a **um único** cadastro; empresa, cadastro e papel vêm
    do convite.
- **Funções da plataforma:**
  - `fn_platform_create_company`;
  - `fn_platform_invite_company_admin`: só funciona enquanto nenhum
    administrador da empresa tem login;
  - `fn_platform_company_onboarding`;
  - `fn_platform_auth_user_id`.
- **Auditoria:** usa as trilhas existentes (`audit_logs` da empresa e
  `fn_log_platform_audit`). Ações registradas:
  - CREATE e REVOKE do convite;
  - CONFIRM do aceite;
  - ASSIGN do vínculo e do administrador.
- **Privilégios:** `EXECUTE` é revogado explicitamente de `anon` e de
  `authenticated`, porque os privilégios padrão do Supabase concedem
  acesso diretamente a esses papéis. Os helpers internos
  (`fn_invitation_token_hash`, `fn_mask_email`,
  `fn_issue_user_invitation`) também são revogados de `service_role`.

**Testes:** `tests/onboarding-sql.test.ts` executa a migration de verdade
(PGlite) sobre stubs do Supabase e cobre os cenários negativos.

### Produção

**0071 e 0072 foram aplicadas** no projeto `bshvfsxapwwfntowdxyr` em
2026-09-24 (versões `20260924111646` e `20260924111759`), depois de
validadas numa réplica local com o mesmo esquema (§5, "E2E real").

Validação pós-aplicação:

- `list_migrations` mostra as duas versões;
- advisors de segurança (555 achados lidos): das funções novas, só
  aparecem as RPCs expostas **de propósito**, e cada uma confere a
  permissão internamente:
  - `fn_get_invitation` para `anon` e `authenticated`;
  - as demais só para `authenticated`.

  Os helpers internos e o gatilho **não** aparecem, ou seja, os REVOKEs
  valeram.

As duas migrations são idempotentes (`if not exists`,
`drop … if exists`, `create or replace`) e podem ser reaplicadas.

## 1.1 Migration 0072 — vínculo login ↔ cadastro

**Problema.** Desde a 0007, a policy `users_update` deixa quem tem
`users.update` alterar **qualquer** coluna de `public.users` da própria
empresa pelo PostgREST, inclusive `auth_user_id`. Com isso, um
administrador ou uma sessão sequestrada poderia ligar um cadastro — e os
papéis dele — a um login qualquer. `users_insert` tinha o mesmo efeito na
criação. O E2E real provou o ataque com JWT verdadeiro antes da correção.

**Dependências conferidas antes de restringir** (nada foi revogado às
cegas):

- nenhuma função do banco de produção escreve `users.auth_user_id`;
- a aplicação não escreve a coluna: os mapeadores não a incluem e há um
  teste de invariante para isso;
- o script de bootstrap só grava `platform_members`;
- `bootstrap_admin_user` (0005) não está instalada.

**Regra.** Um gatilho `BEFORE INSERT OR UPDATE OF auth_user_id`
(`guard_users_auth_link`, SECURITY INVOKER):

| Quem escreve | Resultado |
|---|---|
| `anon`, `authenticated`, `authenticator`, `service_role` | sempre recusado (42501), inclusive para `NULL` |
| dono da tabela sem a marca | vínculo não nulo recusado |
| `fn_accept_user_invitation` | permitido: marca a transação com `educa.auth_link = 'invitation'` (local à transação) imediatamente antes do UPDATE e limpa logo depois |
| `ON DELETE SET NULL` de `auth.users` | permitido (desvinculação) |

A 0072 não altera policy, papel, permissão nem dado; as demais colunas de
`users` seguem editáveis como antes.

**Exceção operacional.** Para corrigir um vínculo manualmente, a única
forma é como dono do banco (SQL Editor), numa transação com
`select set_config('educa.auth_link','invitation',true)`. Isso fica
restrito a quem tem acesso administrativo ao projeto.

---

## 2. Configuração do Supabase Auth

No painel do projeto:

1. **Authentication → URL Configuration**
   - Site URL: a URL pública do app (a mesma de `APP_URL`; em produção,
     `https://educaerp.vercel.app`).
   - Redirect URLs — apenas o domínio de produção, sem curinga de domínio:
     - `https://<app>/convite/**`: o convite leva o token no caminho;
     - `https://<app>/auth/callback**`: o `**` é **necessário**, porque o
       cliente anexa `?next=…&sb_flow_id=…` (§3.6);
     - `https://<app>/redefinir-senha**`.

     Para testar em preview, acrescente a URL **exata** do preview. Não use
     `https://*.vercel.app/**`, que aceitaria redirect para qualquer
     projeto da Vercel.
2. **Authentication → Providers → Email**
   - "Confirm email" ligado.
   - Cadastro público (sign-up) **desligado** ("Allow new users to sign
     up" = off): o acesso é só por convite. O convite do Auth
     (`inviteUserByEmail`) continua funcionando com o sign-up desligado.
3. **SMTP próprio** (Authentication → Emails → SMTP Settings). O SMTP
   padrão do Supabase tem limite baixo e não serve para produção.
   Credenciais necessárias, todas do provedor escolhido (Resend, SES,
   Postmark, SendGrid…):
   - Host;
   - Port (normalmente 465 ou 587);
   - Username;
   - Password (API key SMTP);
   - Sender email: remetente de um domínio verificado no provedor, com
     SPF/DKIM;
   - Sender name.

   Essas credenciais ficam **só** no painel do Supabase, nunca no
   repositório nem na Vercel. Para validar, rode o bootstrap
   (§3.1): o e-mail "You have been invited" deve chegar. Em seguida,
   Authentication → Logs mostra o envio sem erro.
4. *(Recomendado)* Template "Reset password" com `{{ .TokenHash }}`:
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha`.
   Assim o link também funciona se aberto em outro dispositivo. Sem isso, o
   fluxo PKCE padrão exige abrir o link no mesmo navegador que pediu a
   recuperação.
5. Variáveis do app:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - `SUPABASE_SERVICE_ROLE_KEY` (**somente servidor**);
   - `APP_URL`: URL pública (ex.: `https://erp.exemplo.com`), usada nos
     links de convite e no redirect do Auth. O cabeçalho `Host` da
     requisição não decide para onde vai um link com token. Defina-a na
     Vercel (Settings → Environment Variables → Production).
   - **Nunca** crie `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` nem outra
     `NEXT_PUBLIC_*` com segredo: tudo com esse prefixo vai para o
     navegador. Há um teste que falha se isso aparecer no código.

---

## 3. Fluxos

### 3.1 Primeiro Platform Owner (bootstrap)

Não existe tela nem rota HTTP para isso. O bootstrap roda numa máquina
confiável, com a `service_role` no ambiente:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/bootstrap-platform-owner.mjs --email dono@empresa.com --name "Nome" --app-url https://erp.exemplo.com [--dry-run]
```

- **Idempotente:** se o mesmo e-mail já é Owner, não faz nada. Se existe
  outro Owner, recusa; novos Owners são concedidos por um Owner, na
  Administração Central.
- **Sem login:** envia um convite do Auth. A pessoa cria a senha em
  `/redefinir-senha?primeiro-acesso=1` e cai em `/admincentral`.
- **Registro:** chama `bootstrap_platform_owner` (0064), que só executa
  para `service_role` e fica auditado.

### 3.2 Plataforma → empresa → primeiro administrador

1. Em `/admincentral/companies`, **Nova empresa**. Apenas campos do modelo:
   - nome, razão social, documento, contato e endereço;
   - situação inicial (avaliação ou ativa) e plano;
   - unidade inicial opcional.

   Papéis padrão, módulos essenciais e perfil SaaS são criados pelos
   gatilhos existentes.
2. A tela mostra **"Empresa criada"** e o **próximo passo: configurar o
   administrador da empresa** (nome + e-mail).
3. O banco cria (ou reaproveita) o cadastro com o papel de sistema
   `admin` **daquela** empresa e emite um convite `COMPANY_ADMIN`.
4. O detalhe da empresa mostra a situação: "Configurado", "Convite
   pendente" ou "Pendente".
5. Depois que um administrador tem login, a plataforma **não** emite
   outro. Novos acessos são dados pela própria empresa, em `/admin`.
6. A plataforma não lê dados operacionais, não entra na empresa e não tem
   impersonation.

### 3.3 Company Admin → usuários

Em `/admin/users`, cada cadastro mostra a situação de acesso:

- Conta ativa
- Convite pendente
- Convite expirado
- Sem login
- Desativado

Ações possíveis (exigem `users.update`):

- enviar, reenviar ou cancelar convite;
- copiar o link;
- desativar ou reativar o cadastro. O gatilho existente protege o último
  administrador ativo.

**Link copiável:** quando o e-mail não pode ser enviado, o convite continua
válido e o link pode ir por outro canal. Isso **não** abre a conta de
ninguém:

- o aceite exige um login com aquele e-mail, confirmado;
- para quem ainda não tem conta, a senha só é criada pelo link que o
  Supabase envia ao e-mail — o administrador nunca recebe esse link;
- por isso, sem SMTP funcionando, uma pessoa nova não consegue criar
  login.

### 3.4 Convidado

`/convite/<token>` segue esta sequência:

1. **Prévia:** mostra organização, nome, e-mail mascarado, tipo e
   validade.
2. **Sessão:** o link do e-mail chega com a sessão no fragmento da URL. A
   página instala essa sessão e apaga o fragmento da barra de endereço.
3. **Senha:** "Primeiro acesso — crie sua senha".
4. **Aceite:** "Aceitar convite" leva ao ambiente certo:
   - administrador → `/admin`;
   - usuário → `/`.

Estados tratados:

- convite inválido, expirado, cancelado ou já usado;
- e-mail diferente do convite (com a opção "Não sou eu — sair");
- sem sessão (com a opção "Já tenho senha — entrar").

### 3.5 Login e primeiro acesso

- Depois de entrar, o login busca `/api/session/context` **uma vez**. A
  resposta decide o destino (`postLoginDestination`) e é reaproveitada
  pelo shell, sem uma segunda chamada.
- Destinos:
  - usuário → ERP;
  - membro só da plataforma → `/admincentral`;
  - `next=/admincentral` sem papel de plataforma → ERP;
  - sem contexto → `/acesso`.
- `/acesso` e o shell explicam o estado, sem ids, SQL ou detalhes de
  outras empresas:
  - **unlinked:** "Seu acesso ainda não foi configurado. Entre em contato
    com o administrador da sua organização.";
  - **inactive:** "Conta desativada". O cadastro não é apagado e o status
    não é alterado;
  - **no_company:** "Acesso não configurado.".
- **Unidade:**
  - com uma unidade, a seleção é automática;
  - com várias e nenhuma escolha salva, abre um seletor com **só** as
    unidades que `fn_user_context` devolveu;
  - a escolha filtra a visão e nunca amplia acesso.

### 3.6 Senha

"Esqueci minha senha" segue esta sequência:

1. `/recuperar-senha` sempre responde a mesma mensagem, para não
   revelar se existe conta para o e-mail.
2. O e-mail traz o link.
3. `/auth/callback` troca o código **no servidor**, sem open redirect.
   Cada pedido de recuperação tem o seu verificador PKCE. O cliente
   (`appendPkceFlowIdToRedirects`) anexa `sb_flow_id` ao redirect, e o
   callback usa o verificador daquele fluxo. Assim, dois pedidos seguidos
   não invalidam o primeiro link. Antes, só o link mais recente funcionava
   (bug encontrado no E2E real).
4. `/redefinir-senha` grava a nova senha, encerra a sessão e volta a
   `/login?reset=ok`.

Política mínima de senha: 8 caracteres, com letras e números. O Auth pode
exigir mais (senhas vazadas, por exemplo).

### 3.7 Logout

1. O botão "Sair" limpa o estado local:
   - unidade em foco;
   - caches de API;
   - `sessionStorage`;
   - pré-carga da sessão.
2. Em seguida, faz `POST /api/auth/logout`: `signOut` no servidor e 303
   para `/login?saiu=1`.

---

## 4. Proteção de rotas

| Rota | Regra |
|---|---|
| `/login`, `/recuperar-senha` | públicas; com sessão, voltam ao início |
| `/convite/*`, `/redefinir-senha`, `/auth/callback` | públicas; cada uma valida o que precisa |
| demais páginas | sem sessão → `/login?next=...` (proxy) |
| `/admin` | shell exige permissões administrativas da empresa; APIs exigem cadastro ativo + RLS |
| `/admincentral` | shell exige papel de plataforma; APIs exigem `current_platform_role` + `has_platform_permission` |

Os schemas das rotas de onboarding são **estritos**. `company_id`,
`role_id`, `auth_user_id`, `permissions`, `user_id` etc. no corpo são
**rejeitados** com 422, não ignorados em silêncio.

`POST /api/platform/members` só **altera** um membro existente. O e-mail
vem do banco, e um `authUserId` desconhecido responde 404. Um membro novo
entra apenas por `/api/platform/members/invite`, que resolve o login pelo
e-mail. Assim, o cliente não consegue ligar um login arbitrário a um
e-mail qualquer.

---

## 5. Testes

- `tests/onboarding-sql.test.ts` (PGlite, SQL real) cobre:
  - privilégios de `anon` e `authenticated`;
  - fluxo completo de convite → aceite → vínculo, com auditoria;
  - Empresa A → B;
  - usuário sem permissão;
  - e-mail diferente e e-mail não confirmado;
  - login já vinculado;
  - token expirado, reutilizado ou revogado;
  - Company Admin em função de plataforma;
  - Platform Admin inativo;
  - administrador já configurado;
  - RLS dos convites.
- `tests/onboarding.test.ts` cobre:
  - estado de acesso e destino pós-login (open redirect,
    Company Admin → `/admincentral`);
  - rotas públicas;
  - schemas estritos: `company_id` arbitrário e papel superior;
  - links, entrega do convite e fragmento de sessão;
  - bootstrap do Owner;
  - invariantes:
    - `service_role` fora do navegador;
    - nenhuma rota de bootstrap;
    - nenhuma `NEXT_PUBLIC_*` com segredo;
    - o app nunca grava `users.auth_user_id`;
    - a edição de membro mantém o e-mail do banco;
    - Owner só é concedido por Owner, antes de criar login;
    - o callback usa o id do fluxo PKCE.
- `tests/onboarding-sql.test.ts` cobre ainda:
  - a 0072:
    - `authenticated`, `anon`, `service_role` e o dono sem a marca são
      barrados;
    - a marca vale só na transação;
    - o aceite oficial vincula;
    - `ON DELETE SET NULL` segue funcionando;
    - ACL e idempotência;
  - a regra `roles.manage` no convite.

  Uma checagem de mutação confirma o valor desses testes: sem as proteções,
  9 deles falham.

### E2E real e QA visual (réplica local)

A réplica serve para validar o que PGlite não alcança: GoTrue, PostgREST,
e-mail real e navegador. Ela fica fora do repositório (scratchpad da
sessão) e tem estes componentes:

- **Stack:**
  - Postgres 17.6;
  - GoTrue na mesma versão de migrations de auth da produção;
  - PostgREST;
  - Mailpit.
- **Esquema:**
  - fundação de identidade/RBAC/organização extraída do catálogo de
    produção;
  - as migrations 0064–0070 do repositório, com a 0067 de produção;
  - 0071 e 0072.
- **Fidelidade:** a impressão digital de 259 objetos (tabelas,
  constraints, índices, gatilhos, policies, ACLs, funções e catálogos de
  permissão) é idêntica à de produção.
- **Dados:** fixtures só nessa réplica descartável; nada em produção.

Resultados:

- `e2e-real`: **102/102**. Cobre:
  - primeiro acesso do Owner pelo e-mail real;
  - empresa + primeiro admin;
  - convite: hash, uso único, expirado, revogado, reenvio, e-mail
    errado, login já vinculado;
  - isolamento A↔B por RLS;
  - usuário comum sem `/admin` e sem `/admincentral`;
  - Platform Admin × Owner;
  - sequestro de `auth_user_id` com JWT real;
  - reset de senha PKCE (senha antiga para de funcionar);
  - seletor de unidades;
  - desativar/reativar e guarda do último admin;
  - redirects externos;
  - `service_role` ausente dos bundles.
- **QA visual:** 108 telas/estados, desktop 1440 e mobile 390, claro e
  escuro. Resultado: 0 overflow, 0 erro de console, 0 falha de rede. As
  APIs de domínio do ERP cujas tabelas não existem na réplica
  (`PGRST205`) aparecem listadas à parte como limitação do ambiente.

---

## 6. Limites conhecidos

- **`users_update` e `auth_user_id`:** fechado pela 0072 (§1.1).
- **Papéis de sistema `operador` e `leitura` (decisão do negócio).** O
  seed de produção dá a `operador` as permissões
  `users.create/read/update` e criar/editar departamentos e cargos; a
  `leitura` dá `users.read`. Consequências:
  - os dois entram na Administração da Empresa: `operador` edita;
    `leitura` só lê;
  - `operador` pode convidar cadastros **sem papel**, mas não cadastros
    com papel (`roles.manage`, §1).

  Nenhum dos dois é um "usuário comum". Para um papel que só use o ERP,
  crie um papel personalizado (o E2E usa "vendas"). Mudar o seed é uma
  alteração de RBAC e não foi feita aqui.
- **Membro da plataforma novo:** o login é criado por convite **antes** do
  registro como membro, depois de conferida a permissão. Se o banco
  recusar em seguida, sobra um login sem nenhum acesso.
- **O nome da empresa não aparece na Administração Central:** limite
  registrado em UI.md §8.2.
- **Advisors anteriores a esta fase** (fora do escopo, não alterados):
  - 4 views `SECURITY DEFINER` (ERROR): `v_cash_flow_summary`,
    `v_cash_flow_projection`, `inventory_valuation`,
    `v_sales_order_item_margin`;
  - `search_path` mutável (WARN) em `fn_slug` e
    `fn_evaluate_workflow_rule`.

---

## 7. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Link de senha (recuperação pelo painel do Supabase, ou convite com destino fora das Redirect URLs) cai no Site URL | O Auth manda a sessão no fragmento para `APP_URL` | Tratado: `/login` encaminha o fragmento para `/redefinir-senha` (destino fixo). Conta com `educa_password_pending` vê "Crie sua senha" e segue para o seu ambiente; demais contas redefinem e voltam ao login |
| Link de recuperação volta a `/login?erro=link` | Redirect URL sem `**` em `/auth/callback`, link já usado ou expirado | Conferir as Redirect URLs (§2) e pedir um novo link |
| E-mail de convite não chega | SMTP não configurado, ou o limite do SMTP padrão foi atingido | Configurar o SMTP (§2) e ver Authentication → Logs |
| "Reenviar" responde erro logo após enviar | O GoTrue limita a 1 envio por minuto por usuário | Aguardar 60 s |
| Convite: "emitido para outro e-mail" | A pessoa entrou com outra conta | "Não sou eu — sair" e entrar com o e-mail convidado |
| Convite: "exige a permissão de gerenciar papéis" | O cadastro tem papel e quem convida não tem `roles.manage` | Pedir a um administrador |
| `42501 O vínculo de login (auth_user_id) só é definido pelo aceite de convite` | Tentativa de escrever `auth_user_id` fora do aceite | Usar o fluxo de convite; ver a exceção operacional em §1.1 |
| Links de convite apontam para o domínio errado | `APP_URL` ausente ou errado na Vercel | Definir `APP_URL` em Production e fazer novo deploy |
| Convite responde 503 "não está configurado" | Falta `SUPABASE_SERVICE_ROLE_KEY` no servidor | Definir a variável na Vercel (Production; nunca `NEXT_PUBLIC_`) |
| Bootstrap: "já existe outro Owner" | Comportamento esperado (idempotência) | Novos Owners são concedidos por um Owner em `/admincentral/platform-members` |

---

## 8. Estado de produção e pendências

**Domínio de produção:** `https://educaerp.vercel.app`, que é o
`APP_URL`, sem barra no final. Nas Redirect URLs do Auth entram só estes
caminhos exatos:

- `https://educaerp.vercel.app/convite/**`
- `https://educaerp.vercel.app/auth/callback**`
- `https://educaerp.vercel.app/redefinir-senha**`

Não use o curinga `https://*.vercel.app/**`.

Feito (2026-09-24):

- 0071 e 0072 aplicadas e validadas (§1). O gatilho
  `guard_users_auth_link` está ativo.
- `claude/educa-onboarding` integrada em `main` com merge `--no-ff`,
  preservando os commits. A Vercel concluiu o deploy do commit de merge.
- `bootstrap_platform_owner` em produção confere com o esperado:
  - só `service_role` executa;
  - recusa um segundo Owner ativo;
  - registra auditoria de plataforma.
- Estado verificado antes do bootstrap: nenhum Owner, nenhum login no
  Auth, nenhum cadastro vinculado e o e-mail do Owner não existe em lugar
  nenhum.

Pendente, com a ação necessária e quem pode fazê-la:

1. **Supabase Auth** (admin do projeto no painel): sign-up desligado,
   Confirm email ligado, Site URL = `APP_URL`, as Redirect URLs acima e
   SMTP próprio (§2).
2. **Vercel** (admin do projeto na Vercel), variáveis em Production:
   - `APP_URL=https://educaerp.vercel.app`;
   - `SUPABASE_SERVICE_ROLE_KEY`, marcada como Sensitive, só servidor.

   Depois, redeploy da produção.
3. **Bootstrap** (quem tem a `service_role`), numa máquina confiável:

   ```bash
   node scripts/bootstrap-platform-owner.mjs --email <e-mail do Owner> --name "Marcus Valério" --app-url https://educaerp.vercel.app --dry-run
   ```

   Em seguida, o mesmo comando sem `--dry-run`. Precisa de
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente da máquina.
   O e-mail do Owner foi definido pelo dono do produto e não fica
   versionado aqui.
4. **Primeiro login real e testes em produção:** dependem de 1–3. Os
   mesmos cenários passaram na réplica (§5, "E2E real"), inclusive sobre
   o código de `main` depois do merge.
