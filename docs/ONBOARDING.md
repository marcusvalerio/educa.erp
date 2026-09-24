# Onboarding & Identidade

Como uma pessoa real sai de "existe um cadastro no banco" para "entra com
segurança, recebe o contexto certo e usa exatamente o que foi autorizado".

**Princípio:** nenhuma tela, rota ou script concede acesso. Quem decide é o
banco (RLS, `has_permission`, `has_platform_permission` e as funções
`SECURITY DEFINER` da migration 0071). As rotas usam o cliente do **usuário**;
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
  acesso diretamente a esses papéis.

**Testes:** `tests/onboarding-sql.test.ts` executa a migration de verdade
(PGlite) sobre stubs do Supabase e cobre os cenários negativos.

### Aplicar em produção (pendente — requer autorização)

A migration **não foi aplicada** no projeto remoto. Para aplicar, em janela
autorizada:

```bash
supabase db push   # ou: aplicar supabase/migrations/0071_onboarding_identity.sql
```

---

## 2. Configuração do Supabase Auth

No painel do projeto:

1. **Authentication → URL Configuration**
   - Site URL: a URL pública do app.
   - Redirect URLs:
     - `https://<app>/convite/**`
     - `https://<app>/auth/callback**`
     - `https://<app>/redefinir-senha**`
     - as URLs de preview da Vercel, se quiser testar nelas.
2. **Authentication → Providers → Email**
   - "Confirm email" ligado.
   - Cadastro público (sign-up) **desligado**: o acesso é só por convite.
3. **SMTP próprio** (Authentication → Emails → SMTP Settings). O SMTP
   padrão do Supabase tem limite baixo e não serve para produção.
4. *(Recomendado)* Template "Reset password" com `{{ .TokenHash }}`:
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha`.
   Assim o link também funciona se aberto em outro dispositivo. Sem isso, o
   fluxo PKCE padrão exige abrir o link no mesmo navegador que pediu a
   recuperação.
5. Variáveis do app:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - `SUPABASE_SERVICE_ROLE_KEY` (**somente servidor**);
   - `APP_URL`: URL pública, usada nos links de convite. O cabeçalho
     `Host` da requisição não decide para onde vai um link com token.

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
**rejeitados**, não ignorados em silêncio.

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
  - invariantes: `service_role` fora do navegador e nenhuma rota de
    bootstrap.

---

## 6. Limites conhecidos

- **`users_update` existente:** a policy permite que quem tem
  `users.update` altere qualquer coluna de `users` da própria empresa,
  inclusive `auth_user_id`, via PostgREST direto. O app nunca faz isso;
  o vínculo só ocorre pelo aceite. Fechar isso (privilégio por coluna ou
  gatilho) muda uma regra existente e depende de decisão explícita.
- **Membro da plataforma novo:** o login é criado por convite **antes** do
  registro como membro, depois de conferida a permissão. Se o banco
  recusar em seguida, sobra um login sem nenhum acesso.
- **O nome da empresa não aparece na Administração Central:** limite
  registrado em UI.md §8.2.
