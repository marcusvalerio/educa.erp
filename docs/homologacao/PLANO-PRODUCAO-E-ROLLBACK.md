# Plano de aplicação em produção e rollback

**Status: PRONTA PARA APROVAÇÃO DE PRODUÇÃO (contenção v2) — NÃO APLICADA.** Nada deste plano
foi executado em produção. Cada parte exige aprovação explícita e separada.

## 0. Identificação do alvo (conferir antes de qualquer comando)

| Item | Valor esperado | Como conferir |
|---|---|---|
| Projeto Supabase | `educa.erp`, ref **`bshvfsxapwwfntowdxyr`**, região `sa-east-1` | painel do Supabase (o SQL não enxerga o ref); o ref é o subdomínio de `NEXT_PUBLIC_SUPABASE_URL` da Vercel de produção |
| Banco | `system_identifier` **7678069749886157684**, banco `postgres`, PostgreSQL 17.6 | 1ª coluna de `verificacao.sql` (`7678069749886157684/postgres`) — o script aborta sozinho se divergir |
| Ledger | contém `20260929165645` `0075_company_roles_and_user_invites` (86 registros em 12/10) | `select version, name from supabase_migrations.schema_migrations order by version desc limit 3` |
| Estado vulnerável | `verificacao.sql` → `f t t f f f f t t` | rodar antes |
| Arquivo | SHA-256 de `contencao-emergencial.sql` = `84d174bc336a4a1653001bd5b85fa17d66fead740366719f99c98ca0cf0ef03a` | `sha256sum` |
| Executor | papel `postgres` (SQL Editor do painel ou conexão direta) — é o concedente de todos os grants afetados | `select current_user` |

Se qualquer item divergir: **parar**.

## 1. Backup (pré-requisito)

**Situação verificada (12/10):** organização no plano **free**. Pela
documentação oficial do Supabase, backups diários acessíveis existem só nos
planos Pro/Team/Enterprise e PITR é add-on desses planos; para o free a
recomendação é exportar com o CLI. **Não há backup confirmado.** O conector não
lista backups e esta sessão não tem a senha do banco nem acesso de rede ao host.

Antes da parte A (recomendado) e **obrigatório** antes da parte B:

1. No painel: Database → Backups. Confirmar se aparece algum backup agendado
   (esperado: nenhum no free). Se o plano mudar para Pro, confirmar o backup
   diário mais recente e a data.
2. Fora do repositório, numa máquina autorizada:
   `supabase db dump --db-url "$URL" -f schema.sql` (esquema e grants),
   `supabase db dump --db-url "$URL" --role-only -f roles.sql` e
   `supabase db dump --db-url "$URL" --data-only -f dados.sql`. Guardar com
   acesso restrito. **Não** colocar no Git (repositório público).
3. Testar a restauração do dump numa base descartável (local ou projeto
   Supabase de teste), nunca sobre produção.
4. Registrar data/hora, quem gerou e onde está guardado.

Parte A só altera catálogo (policy, opções de view, grants). Sua pré-imagem
exata está em `evidencias/contencao-v2/producao-metadados-12-10.md` e o
rollback SQL a restaura. Por isso, para A, o dump é salvaguarda; para B (que
altera dados em 0079/0080/0081/0085), é **obrigatório**.

## A. Contenção emergencial

**Escopo:** fecha E1, E2 e E3 (`CONTENCAO-SEGURANCA.md`). Sem deploy de código,
sem variável de ambiente, sem migração de infraestrutura.

| Passo | Ação | Esperado |
|---|---|---|
| A1 | Seção 0 (ref, hash) e seção 1 (backup) | conferidos e registrados |
| A2 | `verificacao.sql` (antes) | `7678069749886157684/postgres` · `f t t f f f f t t` |
| A3 | Executar `producao/contencao-emergencial.sql` inteiro, numa única execução (uma transação; aborta sozinho se pré-condição ou verificação falhar) | `COMMIT`, sem erro |
| A4 | `verificacao.sql` (depois) | `t t t t t t t t t` |
| A5 | Fumaça no app com um administrador: Financeiro → Fluxo de caixa; Estoque → Valorização; Controladoria → Margem por produto/cliente; Relatórios executivo e financeiro; Fiscal → calcular um documento em rascunho; Cadastros → Produtos | telas iguais às de antes. Margem por pedido e painel de estoque já falham hoje (0092/0090) e continuam iguais |
| A6 | Chamada anônima à Data API: `GET /rest/v1/v_cash_flow_summary?limit=1` e `POST /rest/v1/rpc/fn_resolve_applicable_tax_rules` com a chave pública | `401`/`403` com `permission denied` |
| A7 | Supabase → Advisors → Security | `security_definer_view` some para as 4 views |

- **Se A3 falhar:** nada foi aplicado (transação). Anotar a mensagem
  (`Contenção: …`) e parar. Não editar o script em produção.
- **Janela:** qualquer horário; locks curtos (`lock_timeout 5s`).
- **Impacto esperado no app:** nenhum (seção 5 de `CONTENCAO-SEGURANCA.md`).
- **Registro:** a contenção roda fora do ledger. Anotar data/hora, executor, SHA do
  arquivo e saídas de A2/A4.

### Rollback de A

`producao/rollback-contencao.sql`. **Reabre risco de segurança.** Não é
resposta rotineira a falhas funcionais: primeiro investigar e corrigir no
código ou numa migration. Usar só com quebra funcional **comprovada**, que não possa
esperar, e pelo menor tempo possível. Executar só as seções da quebra:

| Seção | Restaura | Risco reaberto |
|---|---|---|
| R1 | policy `units_select_authenticated USING (true)` | E1 para todo usuário logado |
| R2 | views sem `security_invoker` | sozinha nenhum (ninguém além do app tem privilégio); com R3, E2 para logados |
| R3 | SELECT nas 4 views para `authenticated` | com R2, totais de todas as empresas para qualquer logado; sem R2, limitado pelo RLS |
| R4 | EXECUTE da função para `service_role` | nenhum para usuários/anon (só o servidor) |
| R5 (comentada) | estado integral anterior: ALL para `anon`/`authenticated`, EXECUTE para `anon`/`authenticated` | **E2 e E3 para qualquer pessoa na internet**; só com decisão explícita registrada |

O rollback tem a mesma guarda de identidade e uma conferência que aborta se
`anon` voltar a ter acesso sem R5. Testado localmente: R1–R4 resultam em
`f t t t f f f t t`; R5 reproduz o catálogo original exatamente; a contenção
reaplica depois sem erro.

## B. Atualização completa (sequência integrada + código)

**Escopo:** migrations 0076 … 0094 (ordem dos nomes) e o código da branch
`claude/atlas-integracao-0076-0093`.

| Pré-condição | Situação (12/10/2026) |
|---|---|
| Duplicidades que quebrariam índices únicos da 0081/0083 (`accounts_receivable_origin_active_unique`, `pick_lists_open_per_order_unique`, `fiscal_documents_own_number_unique`) | **0** grupos duplicados em produção (contagem só leitura) |
| Referências entre empresas que deixariam FKs da 0091 `NOT VALID` | **0** nas 18 relações (contagem só leitura, 10/10) |
| Sequência validada do zero, incremental e sobre banco já atualizado | local: esquema e permissões idênticos (0 linhas de diferença) |
| 0091–0093 sobre a homologação Neon | aplicadas numa branch filha; 18/18 FKs validadas; matriz de papéis = local (`RELATORIO-HOMOLOGACAO-REMOTA.md`) |
| 0076–0088 sobre a homologação Neon | **não executado** (bloqueio de rede; ver relatório remoto) |
| Suíte com o código integrado | `npm test` 1064/1064 (com 0094, inclusive sobre banco contido + 0076…0094); E2E 210 + 66 + 32 + 13 + 37 (antes da 0094) e rotas afetadas 72/72 (com 0094), local |
| Contenção aplicada antes da sequência | banco contido + 0076…0094 = sequência pura: 0 linhas de diferença de esquema/concessões |

**Ordem de deploy (banco antes do código):**
1. Backup (seção 1) e janela de manutenção curta.
2. Parte A, se ainda não aplicada (pode ficar — idempotente).
3. Migrations 0076 → 0094 pelo mecanismo do ledger (`supabase db push` /
   ferramenta de migrations do Supabase), uma a uma, nome = arquivo sem
   `.sql`. Em erro: parar (cada arquivo é transacional).
4. Verificação: `verificacao.sql` (`t` em tudo); `select count(*) from
   pg_constraint where conname like '%same_company_fk' and convalidated` =
   18; ledger com 0076…0094.
5. Deploy do código integrado na Vercel (produção).
6. Fumaça: Produtos (lista sem aviso), Unidades/Categorias por API,
   Locais de estoque (criar), CRM (lead → cliente/oportunidade), Painéis
   Fiscal/Estoque/Produção, NF-e em homologação, Margem por pedido.

**Por que banco antes do código:** o código antigo funciona no banco novo —
**comprovado**: o código da `main` (48775f5, o de produção) sobre o banco
integrado passou em 209/210 verificações do E2E geral; a única diferença é
criar categoria pela API (403, igual à produção hoje: o código antigo pede
`product_categories.create`). Evidência:
`evidencias/integracao-final/e2e-geral-codigo-main-banco-integrado.txt`. O código novo **não** funciona
no banco antigo (chama funções e permissões criadas por 0076–0093). O
intervalo entre os passos 3 e 5 deve ser curto.

### Rollback de B

| Componente | Reversível? | Como |
|---|---|---|
| Código (Vercel) | sim | promover o deploy anterior |
| Policies, views, grants, funções (`create or replace`) | sim, manualmente | restaurar a definição anterior a partir do dump de schema (passo 1) |
| Permissões novas (`units.*`, `unit_conversions.*`) e concessões | sim | `delete` das concessões e códigos inseridos (lista na 0091) |
| FKs compostas, índices únicos | sim | `drop constraint` / `drop index` |
| Dados normalizados (0079 nomes, 0080 JSON null→NULL, 0081 status de reservas, 0085 unidade dos itens) | **não automaticamente** | restaurar do backup se necessário; são correções sem perda de informação útil |

Recomendação: em problema após B, primeiro reverter **só o código**
(o banco novo é compatível com o código antigo) e investigar.

## C. Aprovações necessárias

1. **Autorizar A** (contenção) — recomendado imediatamente.
2. **Autorizar B** — depois da revisão do merge `claude/atlas-integracao-0076-0093`,
   do backup obrigatório (seção 1) e, de preferência, da aplicação de 0076–0088 e 0094 na homologação remota.
3. Quem executa, quando, e quem confere a verificação pós-aplicação.

## D. Credenciais e branches temporárias (Neon `old-butterfly-53570465`, não é produção)

| Branch | id | Situação | Proposta |
|---|---|---|---|
| `homolog` | `br-icy-cell-b62lgh06` | homologação principal; **não alterada** | manter |
| `valida-contencao-20261011` | `br-restless-bonus-b6txjb6l` | filha descartável (contenção v1 + 0091–0093, dados sintéticos) | excluir após aprovação |
| `valida-sequencia-20261012` | `br-blue-king-b6mrb350` | filha descartável; contém o papel **`validador_seq`** | excluir após aprovação (remove o papel) |
| `valida-contencao-v2-20261012` | `br-quiet-surf-b6ob7mhx` | filha descartável criada nesta rodada (contenção v2 em PG17) | excluir após aprovação |

**Papel `validador_seq`** (senha exibida numa sessão anterior). Verificado em 12/10:
- existe **só** na branch `valida-sequencia-20261012` (não existe na `homolog`
  nem nas outras filhas);
- `LOGIN`, membro de `neon_superuser` (`CREATEROLE`, `BYPASSRLS`), o padrão de
  papéis criados pelo painel/API;
- função auxiliar `zz_validacao_exec` **removida** (0 funções `zz_*`);
- 0 objetos próprios, 0 grants em tabelas/funções/schemas/banco, 0 default ACL, 0 sessões;
- `ALTER ROLE validador_seq NOLOGIN` pelo SQL foi **negado** (`permission
  denied to alter role`): o `neondb_owner` não administra papéis criados pelo painel;
- o arquivo local com a credencial já tinha sido destruído; a senha não está
  em nenhum arquivo do repositório nem das evidências.

**A credencial ainda NÃO está revogada.** O risco é limitado a uma branch
descartável com dados sintéticos, mas o papel ignora RLS ali. Formas de revogar
(todas exigem autorização, por serem destrutivas ou exibirem segredo):
1. **Recomendado:** excluir a branch `valida-sequencia-20261012`
   (`br-blue-king-b6mrb350`). Remove o papel e a credencial e não afeta a
   `homolog` (filhas são independentes da mãe).
2. Ou excluir só o papel: painel Neon → projeto → Branches →
   `valida-sequencia-20261012` → Roles & Databases → `validador_seq` → Delete.
3. Ou redefinir a senha (Reset password) sem registrar a nova. Isso invalida a antiga,
   mas a nova seria exibida na tela de quem fizer o reset.
