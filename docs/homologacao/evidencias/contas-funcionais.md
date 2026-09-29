# Contas funcionais de homologação — evidências (29/09/2026)

Seis contas `@atlaserp.test`, uma por papel real do ATLAS.ERP. Nenhuma senha, token ou cookie aparece aqui. A senha única está no arquivo privado de credenciais, fora do Git.

| Resumo | Resultado |
|---|---|
| A. Ensaio no app (pilha local, navegador): criação pelos fluxos oficiais | **14/14** |
| A. Ensaio no app (pilha local, navegador): validação por conta | **191/191** |
| B. Homologação Neon (branch `homolog`): criação no banco e no Neon Auth | 6 contas; 4 convites aceitos |
| B. Homologação Neon: verificação com a identidade de cada conta | **74/74** |
| B. Homologação Neon: senha única confere no hash gravado (verificador do Better Auth 1.4) e senha errada é recusada | **6/6** |
| Produção (Supabase `educa.erp`): contas `@atlaserp.test` | **0** (2 logins, sem alteração desde 28/09) |

## A. Ensaio no app (pilha local)

PostgreSQL local com as mesmas migrations (até `0075`) e o seed da ASTRA, dublê do Neon Auth, caixa de e-mail local e o app desta branch em `next start`. Tudo pela interface (Playwright/Chromium): convite na tela → e-mail → link → "Crie sua senha" → ("Aceitar convite") → login.

### A.1 Criação pelos fluxos oficiais

| Conta | Etapa | Resultado |
|---|---|---|
| prep | Owner que já existia entra na Administração Central | passou |
| prep | ASTRA com administrador (owner.qa, como na homologação) | passou |
| owner | Owner existente convida owner@ como Owner (Membros da plataforma → Convidar membro) | passou |
| owner | primeiro acesso: senha criada pelo link do e-mail → /app/admincentral | passou |
| admin | owner@ convida admin@ como Admin da plataforma | passou |
| admin | primeiro acesso: senha criada pelo link do e-mail → /app/admincentral | passou |
| gerente | administrador da ASTRA convida gerente@ como Gerente (Administração → Usuários) | passou |
| vendedor | administrador da ASTRA convida vendedor@ como Vendedor | passou |
| operador | administrador da ASTRA convida operador@ como Operador | passou |
| leitura | administrador da ASTRA convida leitura@ como Somente leitura | passou |
| gerente | primeiro acesso pelo link do e-mail e convite aceito → /app | passou |
| vendedor | primeiro acesso pelo link do e-mail e convite aceito → /app | passou |
| operador | primeiro acesso pelo link do e-mail e convite aceito → /app | passou |
| leitura | primeiro acesso pelo link do e-mail e convite aceito → /app | passou |

### A.2 Validação por conta

Cada conta: login pela tela, cookie de sessão httpOnly, contexto da sessão, sessão após recarregar, acesso à `/app`, vínculo com empresa, permissões e restrições (API e tela), isolamento plataforma × empresa, tentativas de escalonamento, logout pela interface (Conta → Sair) com API 401 depois, recuperação de senha pelo e-mail (sessões anteriores revogadas), novo login com a mesma senha e senha errada recusada.


#### APIs protegidas sem sessão

| Conta | Verificação | Resultado |
|---|---|---|
| anônimo | GET /api/session/context sem sessão → 401 | passou |
| anônimo | GET /api/customers sem sessão → 401 | passou |
| anônimo | GET /api/platform/members sem sessão → 401 | passou |
| anônimo | GET /api/admin/users sem sessão → 401 | passou |
| anônimo | GET /api/sales-quotes sem sessão → 401 | passou |
| anônimo | /app sem sessão → /login | passou |

#### OWNER → Administração Central

| Conta | Verificação | Resultado |
|---|---|---|
| owner | login pela tela → /app/admincentral | passou |
| owner | autenticação: cookie de sessão httpOnly e SameSite | passou |
| owner | sessão: /api/session/context identifica owner@atlaserp.test | passou |
| owner | sessão: continua após recarregar a página | passou |
| owner | papel: plataforma OWNER | passou |
| owner | sem vínculo com empresa (tenant nulo, sem cadastro em users) | passou |
| owner | acesso à /app → /app/admincentral (Owner não opera empresa: vai para a Central) | passou |
| owner | Central / abre | passou |
| owner | Central /companies abre | passou |
| owner | Central /platform-members abre | passou |
| owner | Central /modules abre | passou |
| owner | Central /permissions abre | passou |
| owner | Central /settings abre | passou |
| owner | Central /audit abre | passou |
| owner | lista membros da plataforma (GET /api/platform/members → 200) | passou |
| owner | lista empresas (GET /api/platform/companies → 200) | passou |
| owner | pode conceder Owner e Admin (opções: Admin da plataforma, Owner) | passou |
| owner | isolamento: leitura de clientes de empresa recusada (GET /api/customers → 401) | passou |
| owner | isolamento: não abre Administração da Empresa (GET /api/admin/users → 403) | passou |
| owner | isolamento: criar orçamento recusado (POST /api/sales-quotes → 401) | passou |
| owner | logout (Conta → Sair) volta ao /login | passou |
| owner | após logout a API recusa (401) | passou |
| owner | após logout /app → /login | passou |
| owner | recuperação: e-mail com link de redefinição | passou |
| owner | recuperação: sessões anteriores revogadas (401 após o cache de 10 s) | passou |
| owner | recuperação: entra de novo com a senha redefinida (a mesma senha única) | passou |
| owner | senha errada é recusada | passou |

#### ADMIN → Administração da plataforma

| Conta | Verificação | Resultado |
|---|---|---|
| admin | login pela tela → /app/admincentral | passou |
| admin | autenticação: cookie de sessão httpOnly e SameSite | passou |
| admin | sessão: /api/session/context identifica admin@atlaserp.test | passou |
| admin | sessão: continua após recarregar a página | passou |
| admin | papel: plataforma ADMIN | passou |
| admin | sem vínculo com empresa (tenant nulo, sem cadastro em users) | passou |
| admin | acesso à /app → /app/admincentral | passou |
| admin | Central / abre | passou |
| admin | Central /companies abre | passou |
| admin | Central /platform-members abre | passou |
| admin | Central /modules abre | passou |
| admin | Central /permissions abre | passou |
| admin | Central /settings abre | passou |
| admin | Central /audit abre | passou |
| admin | lista membros da plataforma (GET /api/platform/members → 200) | passou |
| admin | só concede Admin (opções: Admin da plataforma) | passou |
| admin | escalonamento: convidar Owner é recusado (POST /api/platform/members/invite → 403) | passou |
| admin | escalonamento: promover a si mesmo a Owner é recusado (POST /api/platform/members → 403) | passou |
| admin | governança: desativar um Owner é recusado (POST /api/platform/members → 403) | passou |
| admin | continua ADMIN após as tentativas | passou |
| admin | isolamento: leitura de clientes de empresa recusada (GET /api/customers → 401) | passou |
| admin | isolamento: não é administrador de empresa (GET /api/admin/users → 403) | passou |
| admin | não é administrador de empresa (sem tenant) | passou |
| admin | logout (Conta → Sair) volta ao /login | passou |
| admin | após logout a API recusa (401) | passou |
| admin | após logout /app → /login | passou |
| admin | recuperação: e-mail com link de redefinição | passou |
| admin | recuperação: sessões anteriores revogadas (401 após o cache de 10 s) | passou |
| admin | recuperação: entra de novo com a senha redefinida (a mesma senha única) | passou |
| admin | senha errada é recusada | passou |

#### VENDEDOR → Comercial

| Conta | Verificação | Resultado |
|---|---|---|
| vendedor | login pela tela → /app | passou |
| vendedor | autenticação: cookie de sessão httpOnly e SameSite | passou |
| vendedor | sessão: /api/session/context identifica vendedor@atlaserp.test | passou |
| vendedor | sessão: continua após recarregar a página | passou |
| vendedor | papel: Vendedor na empresa | passou |
| vendedor | vínculo: empresa ASTRA.ERP | passou |
| vendedor | sem papel de plataforma | passou |
| vendedor | acesso à /app (painel da empresa) | passou |
| vendedor | menu mostra Comercial e CRM | passou |
| vendedor | menu não mostra Financeiro, Fiscal, Suprimentos, Produção | passou |
| vendedor | lê clientes (20) e produtos (30) | passou |
| vendedor | cria orçamento com item (POST /api/sales-quotes → 201) | passou |
| vendedor | envia o orçamento ao cliente (POST /api/sales-quotes/:id/send → 200) | passou |
| vendedor | restrição: aprovar orçamento é recusado (POST /api/sales-quotes/:id/approve → 403) | passou |
| vendedor | restrição: contas a receber → 403 (GET /api/accounts-receivable → 403) | passou |
| vendedor | tela Comercial → Orçamentos abre | passou |
| vendedor | restrição: Financeiro → tela bloqueada | passou |
| vendedor | escalonamento: convidar usuário como Administrador é recusado (POST /api/admin/users/invite → 403) | passou |
| vendedor | escalonamento: dar a si mesmo o papel Administrador é recusado (POST /api/admin/users/:id/roles → 403) | passou |
| vendedor | escalonamento: alterar permissões do próprio papel é recusado (PUT /api/admin/roles/:id/permissions → 403) | passou |
| vendedor | escalonamento: convidar Owner da plataforma é recusado (POST /api/platform/members/invite → 403) | passou |
| vendedor | isolamento: membros da plataforma → 403 (GET /api/platform/members → 403) | passou |
| vendedor | isolamento: empresas da plataforma → 403 (GET /api/platform/companies → 403) | passou |
| vendedor | isolamento: /app/admincentral bloqueada | passou |
| vendedor | papel inalterado após as tentativas | passou |
| vendedor | logout (Conta → Sair) volta ao /login | passou |
| vendedor | após logout a API recusa (401) | passou |
| vendedor | após logout /app → /login | passou |
| vendedor | recuperação: e-mail com link de redefinição | passou |
| vendedor | recuperação: sessões anteriores revogadas (401 após o cache de 10 s) | passou |
| vendedor | recuperação: entra de novo com a senha redefinida (a mesma senha única) | passou |
| vendedor | senha errada é recusada | passou |

#### GERENTE → gestão da empresa

| Conta | Verificação | Resultado |
|---|---|---|
| gerente | login pela tela → /app | passou |
| gerente | autenticação: cookie de sessão httpOnly e SameSite | passou |
| gerente | sessão: /api/session/context identifica gerente@atlaserp.test | passou |
| gerente | sessão: continua após recarregar a página | passou |
| gerente | papel: Gerente na empresa | passou |
| gerente | vínculo: empresa ASTRA.ERP | passou |
| gerente | sem papel de plataforma | passou |
| gerente | acesso à /app (painel da empresa) | passou |
| gerente | menu mostra Financeiro, Comercial, Suprimentos e Gestão | passou |
| gerente | aprova o orçamento do vendedor (POST /api/sales-quotes/:id/approve → 200) | passou |
| gerente | converte o orçamento em pedido (POST /api/sales-orders → 201) | passou |
| gerente | envia o pedido para aprovação (POST /api/sales-orders/:id/submit → 200) | passou |
| gerente | aprova o pedido (POST /api/sales-orders/:id/approve → 200) | passou |
| gerente | lê contas a receber (GET /api/accounts-receivable → 200) | passou |
| gerente | lê usuários da empresa (GET /api/admin/users → 200) | passou |
| gerente | tela Gestão abre | passou |
| gerente | restrição: sem 'Convidar usuário' (não gere usuários) | passou |
| gerente | restrição: convidar usuário (mesmo Vendedor) é recusado (POST /api/admin/users/invite → 403) | passou |
| gerente | escalonamento: convidar usuário como Administrador é recusado (POST /api/admin/users/invite → 403) | passou |
| gerente | escalonamento: dar a si mesmo o papel Administrador é recusado (POST /api/admin/users/:id/roles → 403) | passou |
| gerente | escalonamento: alterar permissões do próprio papel é recusado (PUT /api/admin/roles/:id/permissions → 403) | passou |
| gerente | escalonamento: convidar Owner da plataforma é recusado (POST /api/platform/members/invite → 403) | passou |
| gerente | isolamento: membros da plataforma → 403 (GET /api/platform/members → 403) | passou |
| gerente | isolamento: empresas da plataforma → 403 (GET /api/platform/companies → 403) | passou |
| gerente | isolamento: /app/admincentral bloqueada | passou |
| gerente | papel inalterado após as tentativas | passou |
| gerente | logout (Conta → Sair) volta ao /login | passou |
| gerente | após logout a API recusa (401) | passou |
| gerente | após logout /app → /login | passou |
| gerente | recuperação: e-mail com link de redefinição | passou |
| gerente | recuperação: sessões anteriores revogadas (401 após o cache de 10 s) | passou |
| gerente | recuperação: entra de novo com a senha redefinida (a mesma senha única) | passou |
| gerente | senha errada é recusada | passou |

#### OPERADOR → Estoque/Operação

| Conta | Verificação | Resultado |
|---|---|---|
| operador | login pela tela → /app | passou |
| operador | autenticação: cookie de sessão httpOnly e SameSite | passou |
| operador | sessão: /api/session/context identifica operador@atlaserp.test | passou |
| operador | sessão: continua após recarregar a página | passou |
| operador | papel: Operador na empresa | passou |
| operador | vínculo: empresa ASTRA.ERP | passou |
| operador | sem papel de plataforma | passou |
| operador | acesso à /app (painel da empresa) | passou |
| operador | menu mostra Logística/estoque e Comercial | passou |
| operador | lê locais de estoque (30) | passou |
| operador | registra entrada de estoque (POST /api/stock-movements/receive → 201) | passou |
| operador | consulta o pedido aprovado (GET /api/sales-orders/:id → 200) | passou |
| operador | restrição: reservar estoque do pedido (exige aprovação) é recusado (POST /api/sales-orders/:id/reserve → 403) | passou |
| operador | cria orçamento (permitido ao Operador) (POST /api/sales-quotes → 201) | passou |
| operador | restrição: aprovar orçamento é recusado (POST /api/sales-quotes/:id/approve → 403) | passou |
| operador | tela /app/logistica/recebimento abre | passou |
| operador | escalonamento: convidar usuário como Administrador é recusado (POST /api/admin/users/invite → 403) | passou |
| operador | escalonamento: dar a si mesmo o papel Administrador é recusado (POST /api/admin/users/:id/roles → 403) | passou |
| operador | escalonamento: alterar permissões do próprio papel é recusado (PUT /api/admin/roles/:id/permissions → 403) | passou |
| operador | escalonamento: convidar Owner da plataforma é recusado (POST /api/platform/members/invite → 403) | passou |
| operador | isolamento: membros da plataforma → 403 (GET /api/platform/members → 403) | passou |
| operador | isolamento: empresas da plataforma → 403 (GET /api/platform/companies → 403) | passou |
| operador | isolamento: /app/admincentral bloqueada | passou |
| operador | papel inalterado após as tentativas | passou |
| operador | logout (Conta → Sair) volta ao /login | passou |
| operador | após logout a API recusa (401) | passou |
| operador | após logout /app → /login | passou |
| operador | recuperação: e-mail com link de redefinição | passou |
| operador | recuperação: sessões anteriores revogadas (401 após o cache de 10 s) | passou |
| operador | recuperação: entra de novo com a senha redefinida (a mesma senha única) | passou |
| operador | senha errada é recusada | passou |

#### SOMENTE LEITURA → consultas

| Conta | Verificação | Resultado |
|---|---|---|
| leitura | login pela tela → /app | passou |
| leitura | autenticação: cookie de sessão httpOnly e SameSite | passou |
| leitura | sessão: /api/session/context identifica leitura@atlaserp.test | passou |
| leitura | sessão: continua após recarregar a página | passou |
| leitura | papel: Somente leitura na empresa | passou |
| leitura | vínculo: empresa ASTRA.ERP | passou |
| leitura | sem papel de plataforma | passou |
| leitura | acesso à /app (painel da empresa) | passou |
| leitura | consulta (GET /api/customers → 200) | passou |
| leitura | consulta (GET /api/products → 200) | passou |
| leitura | consulta (GET /api/sales-quotes → 200) | passou |
| leitura | consulta (GET /api/sales-orders → 200) | passou |
| leitura | consulta (GET /api/accounts-receivable → 200) | passou |
| leitura | restrição: criar orçamento → 403 (POST /api/sales-quotes → 403) | passou |
| leitura | restrição: aprovar pedido → 403 (POST /api/sales-orders/:id/approve → 403) | passou |
| leitura | restrição: entrada de estoque → 403 (POST /api/stock-movements/receive → 403) | passou |
| leitura | tela Orçamentos abre só para consulta (sem 'Novo orçamento') | passou |
| leitura | escalonamento: convidar usuário como Administrador é recusado (POST /api/admin/users/invite → 403) | passou |
| leitura | escalonamento: dar a si mesmo o papel Administrador é recusado (POST /api/admin/users/:id/roles → 403) | passou |
| leitura | escalonamento: alterar permissões do próprio papel é recusado (PUT /api/admin/roles/:id/permissions → 403) | passou |
| leitura | escalonamento: convidar Owner da plataforma é recusado (POST /api/platform/members/invite → 403) | passou |
| leitura | isolamento: membros da plataforma → 403 (GET /api/platform/members → 403) | passou |
| leitura | isolamento: empresas da plataforma → 403 (GET /api/platform/companies → 403) | passou |
| leitura | isolamento: /app/admincentral bloqueada | passou |
| leitura | papel inalterado após as tentativas | passou |
| leitura | logout (Conta → Sair) volta ao /login | passou |
| leitura | após logout a API recusa (401) | passou |
| leitura | após logout /app → /login | passou |
| leitura | recuperação: e-mail com link de redefinição | passou |
| leitura | recuperação: sessões anteriores revogadas (401 após o cache de 10 s) | passou |
| leitura | recuperação: entra de novo com a senha redefinida (a mesma senha única) | passou |
| leitura | senha errada é recusada | passou |

### A.3 Menu por papel (seções do ERP)

| Papel | Seções no menu |
|---|---|
| vendedor | gestao, comercial, crm, logistica, cadastros, configuracoes |
| gerente | gestao, comercial, crm, suprimentos, logistica, producao, financeiro, fiscal, projetos, qualidade, ativos, cadastros, configuracoes |
| operador | gestao, comercial, suprimentos, logistica, producao, financeiro, fiscal, cadastros, configuracoes |
| leitura | gestao, comercial, suprimentos, logistica, producao, financeiro, fiscal, cadastros, configuracoes |

## B. Homologação Neon (branch `homolog`, banco `educa` + Neon Auth)

Este ambiente de trabalho não alcança o Preview nem o Neon Auth da homologação por HTTP (o proxy recusa `*.neon.tech` e `*.vercel.app`). A criação seguiu as mesmas chamadas do app, feitas no banco com `set role authenticated` e a identidade (`request.jwt.claims`) de quem age, como o app faz a cada requisição:

1. **Owner:** o Owner que já existia confere `platform.members.manage` e `is_platform_owner`; identidade criada no Neon Auth pela API de administração; login-sombra e `fn_link_identity` (service_role); `fn_upsert_platform_member(..., OWNER)` com a identidade do Owner que convida.
2. **Admin:** mesmo caminho, convidado pelo **Owner novo** (`owner@atlaserp.test`).
3. **Gerente, Vendedor, Operador, Somente leitura:** `fn_invite_company_user` com a identidade do administrador da ASTRA; identidade no Neon Auth + vínculo; aceite com `fn_accept_user_invitation` pela identidade de cada convidado.
4. **Primeiro acesso:** senha gravada na credencial do Neon Auth (hash scrypt no formato do Better Auth, salt próprio por conta) e e-mail confirmado, como o app faz ao concluir o link de primeiro acesso.

Os fluxos principais (orçamento → aprovação → pedido → aprovação; entrada de estoque) ficaram gravados na ASTRA. As tentativas de escalonamento rodaram em blocos sempre desfeitos: nenhuma deixou resíduo.

| Conta | Verificação | Esperado | Obtido |
|---|---|---|---|
| owner | papel da plataforma | OWNER | OWNER |
| owner | cadastro em empresa (current_app_user_id) | nenhum | nenhum |
| owner | membros da plataforma visíveis | 4 | 4 |
| owner | clientes de empresa visíveis (RLS) | 0 | 0 |
| owner | permissões da plataforma | 14 | 14 |
| owner | criar orçamento na ASTRA | recusado | recusado: Permissão negada (sales_quotes.create) |
| admin | papel da plataforma | ADMIN | ADMIN |
| admin | cadastro em empresa (current_app_user_id) | nenhum | nenhum |
| admin | é Owner? | não | não |
| admin | clientes de empresa visíveis (RLS) | 0 | 0 |
| admin | permissões da plataforma | 12 | 12 |
| admin | escalonamento: promover a si mesmo a OWNER | recusado | recusado: Apenas o Platform Owner pode criar ou alterar outro Owner |
| admin | governança: desativar o OWNER | recusado | recusado: Apenas o Platform Owner pode criar ou alterar outro Owner |
| admin | escalonamento: registrar um novo OWNER | recusado | recusado: Apenas o Platform Owner pode criar ou alterar outro Owner |
| admin | criar orçamento na ASTRA | recusado | recusado: Permissão negada (sales_quotes.create) |
| vendedor | papel na empresa (fn_user_context) | vendedor | vendedor |
| vendedor | empresa | ASTRA.ERP | ASTRA.ERP |
| vendedor | papel de plataforma | nenhum | nenhum |
| vendedor | permissões (criar orç./aprovar orç./aprovar pedido/entrada estoque/contas a receber) | s/n/n/n/n | s/n/n/n/n |
| vendedor | clientes visíveis (RLS) | > 0 | 20 |
| vendedor | membros da plataforma visíveis (RLS) | 0 | 0 |
| vendedor | FLUXO Comercial: cria orçamento com item | ok | ok: ORC-0001 |
| vendedor | FLUXO Comercial: envia o orçamento ao cliente | ok | ok: ORC-0001 enviado |
| vendedor | aprovar o próprio orçamento | recusado | recusado: Permissão negada (sales_quotes.approve) |
| vendedor | entrada de estoque | recusado | recusado: Permissão negada (stock.create) |
| vendedor | escalonamento: convidar usuário como Administrador | recusado | recusado: Permissão negada (users.create) |
| vendedor | escalonamento: dar a si mesmo o papel Administrador | recusado | recusado: Permissão negada (roles.manage) |
| vendedor | escalonamento: alterar permissões do próprio papel | recusado | recusado: Permissão negada (roles.manage) |
| vendedor | escalonamento: tornar-se OWNER da plataforma | recusado | recusado: Permissão negada (platform.members.manage) |
| gerente | papel na empresa (fn_user_context) | gerente | gerente |
| gerente | empresa | ASTRA.ERP | ASTRA.ERP |
| gerente | papel de plataforma | nenhum | nenhum |
| gerente | permissões (criar orç./aprovar orç./aprovar pedido/entrada estoque/contas a receber) | s/s/s/s/s | s/s/s/s/s |
| gerente | clientes visíveis (RLS) | > 0 | 20 |
| gerente | membros da plataforma visíveis (RLS) | 0 | 0 |
| gerente | FLUXO Gestão: aprova o orçamento do vendedor | ok | ok: ORC-0001 aprovado |
| gerente | FLUXO Gestão: converte o orçamento em pedido | ok | ok: PV-0001 |
| gerente | FLUXO Gestão: envia o pedido para aprovação | ok | ok: PV-0001 |
| gerente | FLUXO Gestão: aprova o pedido | ok | ok: PV-0001 aprovado |
| gerente | convidar usuário (mesmo Vendedor) | recusado | recusado: Permissão negada (users.create) |
| gerente | escalonamento: convidar usuário como Administrador | recusado | recusado: Permissão negada (users.create) |
| gerente | escalonamento: dar a si mesmo o papel Administrador | recusado | recusado: Permissão negada (roles.manage) |
| gerente | escalonamento: alterar permissões do próprio papel | recusado | recusado: Permissão negada (roles.manage) |
| gerente | escalonamento: tornar-se OWNER da plataforma | recusado | recusado: Permissão negada (platform.members.manage) |
| operador | papel na empresa (fn_user_context) | operador | operador |
| operador | empresa | ASTRA.ERP | ASTRA.ERP |
| operador | papel de plataforma | nenhum | nenhum |
| operador | permissões (criar orç./aprovar orç./aprovar pedido/entrada estoque/contas a receber) | s/n/n/s/s | s/n/n/s/s |
| operador | clientes visíveis (RLS) | > 0 | 20 |
| operador | membros da plataforma visíveis (RLS) | 0 | 0 |
| operador | FLUXO Estoque: entrada de 25 un. de Solvente Industrial | ok | ok: movimento de entrada gravado |
| operador | consulta o pedido aprovado | 1 | 1 |
| operador | aprovar orçamento | recusado | recusado: Permissão negada (sales_quotes.approve) |
| operador | reservar estoque do pedido | recusado | recusado: Permissão negada (sales_orders.reserve) |
| operador | escalonamento: convidar usuário como Administrador | recusado | recusado: Permissão negada (users.create) |
| operador | escalonamento: dar a si mesmo o papel Administrador | recusado | recusado: Permissão negada (roles.manage) |
| operador | escalonamento: alterar permissões do próprio papel | recusado | recusado: Permissão negada (roles.manage) |
| operador | escalonamento: tornar-se OWNER da plataforma | recusado | recusado: Permissão negada (platform.members.manage) |
| leitura | papel na empresa (fn_user_context) | leitura | leitura |
| leitura | empresa | ASTRA.ERP | ASTRA.ERP |
| leitura | papel de plataforma | nenhum | nenhum |
| leitura | permissões (criar orç./aprovar orç./aprovar pedido/entrada estoque/contas a receber) | n/n/n/n/s | n/n/n/n/s |
| leitura | clientes visíveis (RLS) | > 0 | 20 |
| leitura | membros da plataforma visíveis (RLS) | 0 | 0 |
| leitura | FLUXO Consulta: orçamentos visíveis | >= 1 | 1 |
| leitura | FLUXO Consulta: pedidos visíveis | >= 1 | 1 |
| leitura | FLUXO Consulta: saldo de estoque visível | >= 1 | 1 |
| leitura | criar orçamento | recusado | recusado: Permissão negada (sales_quotes.create) |
| leitura | entrada de estoque | recusado | recusado: Permissão negada (stock.create) |
| leitura | aprovar pedido | recusado | recusado: Permissão negada (sales_orders.approve) |
| leitura | escalonamento: convidar usuário como Administrador | recusado | recusado: Permissão negada (users.create) |
| leitura | escalonamento: dar a si mesmo o papel Administrador | recusado | recusado: Permissão negada (roles.manage) |
| leitura | escalonamento: alterar permissões do próprio papel | recusado | recusado: Permissão negada (roles.manage) |
| leitura | escalonamento: tornar-se OWNER da plataforma | recusado | recusado: Permissão negada (platform.members.manage) |

## O que ainda não foi feito na homologação

- **Login, logout e recuperação de senha pelo app publicado da homologação:** dependem do Preview com as variáveis da branch (seção 6 do README) ou de liberar `*.neon.tech` e `*.vercel.app` na rede deste ambiente. No app, esses fluxos passaram na pilha local (seção A).
- **E-mail real:** o remetente compartilhado do Neon Auth não entrega em `@atlaserp.test` (domínio reservado). A recuperação de senha na homologação precisa de uma caixa real ou de SMTP próprio.
