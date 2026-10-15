# Homologação remota — Neon (11–13/10/2026)

## 1. Ambiente identificado

| Item | Valor |
|---|---|
| Projeto | `educa-erp-prod` (`old-butterfly-53570465`), aws-sa-east-1. **Não é a produção atual** (produção = Supabase `bshvfsxapwwfntowdxyr`); é o alvo da futura migração |
| Branch de homologação | `homolog` (`br-icy-cell-b62lgh06`), PostgreSQL 17.11, banco `educa` |
| Estado da `homolog` (metadados) | banco `educa`: objetos de 0070–0075 presentes, 0076+ ausentes. Banco `neondb`: na **0073** (conferido objeto a objeto em 13/10). Nos dois, **mesmas exposições da produção** (policy aberta em `units`, 4 views com `anon`, sem `units.*`); sem ledger |
| Acesso | conector Neon desta sessão (`run_sql` / `run_sql_transaction`). **Conexão direta bloqueada**: a política de rede da organização recusa `*.neon.tech` (CONNECT 403 no proxy) — nem `psql` nem o driver HTTP |
| Branch `homolog` alterada? | **Não.** Toda mutação foi feita em branches filhas descartáveis |

Branches criadas (podem ser excluídas pelo administrador; não foram excluídas
por esta sessão):

| Branch | Id | Uso |
|---|---|---|
| `valida-contencao-20261011` | `br-restless-bonus-b6txjb6l` | contenção (seção 2) |
| `valida-sequencia-20261012` | `br-blue-king-b6mrb350` | migrations 0091–0093 (seção 3). Contém o papel `validador_seq` (sem acesso de dono; a função auxiliar usada foi removida) |

Dados: só sintéticos (empresas "Alfa/Beta … (sintética)", e-mails
`@validacao.test`). Nenhum dado preexistente foi lido.

## 2. Contenção (`contencao-emergencial.sql`)

Aplicada na branch filha com as mesmas instruções do arquivo, numa transação
(pré-condições e verificação internas não abortaram).

| Verificação | Antes | Depois |
|---|---|---|
| metadados (policy aberta / views anon / security_invoker / regras fiscais anon) | ✖ ✖ ✖ ✖ | ✔ ✔ ✔ ✔ |
| anon → `v_cash_flow_summary` | 3 empresas (inclui o saldo sintético da Beta) | `permission denied` |
| Alfa (admin) → unidades da Beta | 10 | 0 |
| Alfa (admin) → caixa da Beta | 1 linha (2000) | 0 |
| Alfa (admin) → próprio caixa | — | 1000 |
| `service_role` (app) → view | — | 2 empresas (inalterado) |

## 3. Migrations 0091, 0092, 0093 (correção definitiva)

**Como:** o conector aceita um comando por chamada e a rede bloqueia conexão
direta. Cada arquivo foi enviado uma única vez numa instrução que devolve o
`md5` do texto recebido e o executa como dono, por uma função auxiliar
criada só nessa branch e **removida** ao final.

| Arquivo | md5 local | md5 recebido no servidor |
|---|---|---|
| 0091_isolamento_catalogo_e_views.sql | `8f532df0f54759234f1f4e4b3b1618d9` | idêntico |
| 0092_margem_por_pedido.sql | `842e6b994b3e2d38378642c8291f26a9` | idêntico |
| 0093_regras_fiscais_sem_execucao_publica.sql | `3d3544fd32bea0245e85b2cefa69af92` | idêntico |

**Resultado (metadados):** policy aberta 0; FKs por empresa **18/18
validadas sobre os dados da homologação**; 4/4 views `security_invoker`; 8
códigos `units.*`/`unit_conversions.*`; regras fiscais sem execução por anon.

**Matriz de papéis (empresa sintética nova) — igual à local:**

| Papel | CRM | units.read | escrita em unidades | total |
|---|---|---|---|---|
| admin | 20 | ✔ | ✔ | 360 |
| gerente | 20 | ✔ | ✔ | 340 |
| leitura (Somente leitura) | **0** | ✔ | — | 20 |
| operador | 10 | ✔ | ✔ | 173 |
| vendedor | 15 | ✔ | — | 41 |

**RLS com identidades sintéticas:**

| Caso | Resultado |
|---|---|
| Alfa · Somente leitura lê unidades | 10 próprias; 0 da Beta; 1 empresa visível; caixa da Beta 0 |
| Alfa · admin | unidades da Beta 0; próprio saldo 1000; caixa da Beta 0; `has_permission(Beta, units.read)` = false |
| Alfa · admin insere unidade na Beta | `new row violates row-level security policy` |
| conversão Alfa → unidade da Beta (mesmo como `service_role`) | `violates foreign key constraint "unit_conversions_to_unit_id_same_company_fk"` |
| Alfa · Somente leitura insere unidade própria | `new row violates row-level security policy` |
| anon → `inventory_valuation` | `permission denied` |

## 4. O que NÃO foi validado remotamente (bloqueio real)

- ~~0076–0094 sobre o banco `educa`~~ — feito em 15/10 (0076 → 0095, §6).
- **E2E do app contra o Neon**: mesmo bloqueio de rede.
- Supabase: não existe ambiente remoto de homologação no Supabase; a produção
  só foi lida (metadados/contagens).

## 5. Migrations 0074 → 0094 sobre a 0073 (13/10/2026)

| Item | Valor |
|---|---|
| Branch filha | `homolog-0074-0094-20261013` (`br-hidden-cherry-b6dj1ksb`), criada da `homolog`; banco `neondb` |
| Ponto de partida | catálogo conferido objeto a objeto contra a referência local: **0073** (só faltavam os objetos da 0074 e da 0075) |
| Como | cada arquivo dividido em comandos por um divisor que respeita `$$`, aspas e comentários. A fidelidade foi provada localmente: o mesmo divisor sobre um banco 0073 dá catálogo idêntico ao da sequência pura (4.630 objetos, 0 diferenças). Depois, um `run_sql_transaction` por arquivo (uma transação por migration), na ordem 0074 … 0094 |
| Erros | nenhum; nenhum `WARNING` de FK `NOT VALID` |

**Conferências**

| Conferência | Resultado |
|---|---|
| 0074/0075: 10 funções + `audit_logs_action_check` (hash de corpo/segurança e ACL) | 12/12 idênticos à referência local |
| Catálogo final × local 0094 (tabelas, constraints, índices, views, funções, policies, RLS, gatilhos, grants, sequências) | **11/11 categorias e 4.630 objetos idênticos**. Única normalização: o privilégio `MAINTAIN` (`m`) do PostgreSQL 17 nas ACLs de tabela, que o local (16) não tem |
| E1: policy `units_select_authenticated` | ausente; RLS ligado; `units_select/insert/update/delete` presentes |
| E2: 4 views | 4/4 `security_invoker`; `anon` e `authenticated` sem SELECT; `service_role` lê as 4 |
| E2 com troca de papel | `anon` → `v_cash_flow_summary`: `permission denied`; `authenticated` → `v_sales_order_item_margin`: `permission denied` |
| E3: `fn_resolve_applicable_tax_rules` | nenhum de `anon`/`authenticated`/`service_role` executa; `authenticated` → `permission denied for function` |
| `authenticated` sem JWT → `units` | 0 linhas |
| FKs `*_same_company_fk` | 18/18 validadas |

**Não feito aqui:** E2E da aplicação contra esta branch (sem rede até `*.neon.tech`
e Preview atrás da autenticação da Vercel); sequência sobre o banco `educa`.
A branch fica para conferência; excluir só com aprovação.

## 6. 0076 → 0095 sobre o banco `educa` (dados de homologação, 15/10/2026)

Mesma branch filha `br-hidden-cherry-b6dj1ksb`, banco `educa`. Antes de aplicar, o
catálogo foi conferido por categoria: **idêntico à referência local 0075** (11/11).

| Conferência | Resultado |
|---|---|
| Aplicação 0076 → 0095 (uma transação por arquivo) | 20/20 sem erro; travas de duplicidade da 0081/0083 passaram sobre os dados |
| Catálogo final × local 0095 | **11/11 categorias idênticas** (normalizado só o `MAINTAIN` do PG17) |
| FKs `*_same_company_fk` sobre os dados de homologação | 18/18 validadas (nenhuma referência entre empresas) |
| E1/E2/E3 | policy aberta ausente; 4/4 views `security_invoker`, 0 grants para `anon`/`authenticated`, `service_role` lê as 4; função fiscal sem executor |
| Senha provisória (0095), fluxo completo com dados sintéticos numa transação desfeita | Administrador gera (resposta sem senha); `authenticated` não lê a tabela; identidade **bloqueada** enquanto pendente; troca libera e liga o login ao cadastro; 3 registros de auditoria; o novo Vendedor cria pedido e não administra usuários. Depois: 0 empresa, 0 login e 0 senha sintéticos restantes |

Não feito: E2E do app e as rotas do Neon Auth (`/admin/set-user-password`,
`/change-password`) contra o serviço real — sem rede até `*.neon.tech` nesta sessão.
